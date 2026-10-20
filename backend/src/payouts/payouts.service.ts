import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PayoutStatus } from '@prisma/client';
import { CronJob } from 'cron';
import { withAdvisoryLock } from '../common/advisory-lock';
import { AppConfig } from '../config/app-config';
import { Accounts, LedgerService } from '../ledger/ledger.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/providers/payment-provider';
import { PrismaService } from '../prisma/prisma.service';

const FAILED_PAYOUT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Name of the daily pass in the SchedulerRegistry. */
export const PAYOUTS_JOB = 'payouts';

@Injectable()
export class PayoutsService implements OnModuleInit {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: AppConfig,
    private readonly scheduler: SchedulerRegistry,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * One payout pass a day at PAYOUT_HOUR_UTC, so each user costs at most one transfer fee a day.
   * The hour comes from the config, hence a job registered here rather than a static @Cron.
   */
  onModuleInit() {
    const job = CronJob.from({
      cronTime: `0 ${this.config.payoutHourUtc} * * *`,
      timeZone: 'UTC',
      onTick: () => this.scheduled(),
    });
    this.scheduler.addCronJob(PAYOUTS_JOB, job);
    if (this.config.cronEnabled) job.start();
  }

  /** The daily pass. With several instances, only the one that takes the lock pays (rule 7). */
  async scheduled() {
    if (!this.config.cronEnabled) return;
    try {
      const outcome = await withAdvisoryLock(this.prisma, 'payouts:daily', () => this.runBatch());
      if (outcome.ran) this.logger.log(`daily payouts: ${outcome.result} started`);
      else this.logger.log('daily payouts already running on another instance');
    } catch (err) {
      this.logger.error(`payout batch failed: ${String(err)}`);
    }
  }

  /**
   * Pays out every user whose released balance reaches the minimum, in one transfer per user,
   * so several days or jobs released together cost a single provider fee.
   */
  async runBatch(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ userId: string; balance: bigint }[]>`
      SELECT a."userId", SUM(p."amountXof")::bigint AS balance
      FROM "LedgerAccount" a JOIN "Posting" p ON p."accountId" = a."id"
      WHERE a."type" = 'USER_PAYABLE' AND a."userId" IS NOT NULL
      GROUP BY a."userId"
      HAVING SUM(p."amountXof") >= ${this.config.minPayoutXof}`;

    let started = 0;
    for (const row of rows) {
      if (await this.payUser(row.userId)) started++;
    }
    return started;
  }

  async payUser(userId: string): Promise<boolean> {
    const payout = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.payoutOperator || !user.payoutPhone || user.disabledAt) return null;
      if (user.payoutHoldUntil && user.payoutHoldUntil > new Date()) return null;

      const inFlight = await tx.payout.count({ where: { userId, status: PayoutStatus.PENDING } });
      if (inFlight > 0) return null;
      const recentFailure = await tx.payout.findFirst({
        where: { userId, status: PayoutStatus.FAILED, updatedAt: { gt: new Date(Date.now() - FAILED_PAYOUT_COOLDOWN_MS) } },
      });
      if (recentFailure) return null;

      const balance = await this.ledger.balance(Accounts.payable(userId).code, tx);
      if (balance < this.config.minPayoutXof) return null;

      const created = await tx.payout.create({
        data: {
          userId,
          provider: this.provider.name,
          operator: user.payoutOperator,
          phone: user.payoutPhone,
          amountXof: balance,
        },
      });
      await this.ledger.post(tx, 'PAYOUT', `payout:${created.id}`, [
        { account: Accounts.payable(userId), amountXof: -balance },
        { account: Accounts.clearing(this.provider.name), amountXof: balance },
      ], 'Versement mobile money');
      return created;
    });
    if (!payout) return false;

    try {
      const res = await this.provider.createPayout({
        payoutId: payout.id,
        amountXof: payout.amountXof,
        operator: payout.operator,
        phone: payout.phone,
      });
      await this.prisma.payout.update({ where: { id: payout.id }, data: { providerRef: res.providerRef } });
    } catch (err) {
      this.logger.error(`payout ${payout.id} rejected by provider: ${String(err)}`);
      await this.fail(payout.id, 'provider_error');
    }
    return true;
  }

  async settle(providerRef: string, status: 'SUCCEEDED' | 'FAILED', reason?: string, amountXof?: number) {
    const payout = await this.prisma.payout.findUnique({ where: { providerRef } });
    if (!payout) {
      this.logger.warn(`webhook for unknown payout ${providerRef}`);
      return;
    }
    if (amountXof !== undefined && amountXof !== payout.amountXof) {
      this.logger.error(`payout ${payout.id}: provider reports ${amountXof} XOF, expected ${payout.amountXof}. Left pending.`);
      return;
    }
    if (status === 'SUCCEEDED') {
      await this.prisma.payout.updateMany({
        where: { id: payout.id, status: PayoutStatus.PENDING },
        data: { status: PayoutStatus.SUCCEEDED },
      });
      return;
    }
    await this.fail(payout.id, reason ?? 'declined');
  }

  /** A failed transfer puts the money back on the user's balance for the next batch. */
  private async fail(payoutId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.PENDING },
        data: { status: PayoutStatus.FAILED, failureReason: reason },
      });
      if (claimed.count !== 1) return;
      const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
      await this.ledger.post(tx, 'PAYOUT_REVERSAL', `payout-reversal:${payout.id}`, [
        { account: Accounts.clearing(payout.provider), amountXof: -payout.amountXof },
        { account: Accounts.payable(payout.userId), amountXof: payout.amountXof },
      ], `Versement échoué: ${reason}`);
    });
  }

  async history(userId: string) {
    const [balance, payouts] = await Promise.all([
      this.ledger.balance(Accounts.payable(userId).code),
      this.prisma.payout.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, amountXof: true, operator: true, status: true, createdAt: true },
      }),
    ]);
    return { balanceXof: balance, payouts };
  }
}
