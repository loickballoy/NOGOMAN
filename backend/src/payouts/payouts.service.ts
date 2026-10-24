import {
  BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, OnModuleInit,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Payout, PayoutStatus } from '@prisma/client';
import { CronJob } from 'cron';
import { withAdvisoryLock } from '../common/advisory-lock';
import { formatXof } from '../common/money';
import { AppConfig } from '../config/app-config';
import { Accounts, LedgerService } from '../ledger/ledger.service';
import { PAYMENT_PROVIDER, PaymentProvider, PayoutRejectedError } from '../payments/providers/payment-provider';
import { PrismaService } from '../prisma/prisma.service';

const FAILED_PAYOUT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Name of the daily pass in the SchedulerRegistry. */
export const PAYOUTS_JOB = 'payouts';

/** Why a payout is refused while PAYOUTS_ENABLED=false (503 PAYOUTS_SUSPENDED for the API). */
export const payoutsSuspended = () => new ServiceUnavailableException({
  code: 'PAYOUTS_SUSPENDED',
  message: 'Les versements sont suspendus pour le moment. Votre solde est conservé.',
});

/** Why no payout was started for a user. */
export type PayoutRefusal =
  | 'SUSPENDED' // PAYOUTS_ENABLED=false
  | 'ACCOUNT_DISABLED'
  | 'NO_METHOD' // no mobile money number
  | 'COOLDOWN' // safety delay after a payout number change
  | 'IN_PROGRESS' // a transfer is already pending
  | 'RECENT_FAILURE' // the last transfer failed less than 6 h ago
  | 'TOO_LOW'; // balance under the threshold

export type PayoutAttempt =
  | { ok: true; payout: Payout }
  | { ok: false; reason: PayoutRefusal; retryAt?: Date; balanceXof?: number };

/** What the owner sees of a payout: never the number it goes to. */
export interface PayoutView {
  id: string;
  amountXof: number;
  status: PayoutStatus;
  operator: Payout['operator'];
}

const hoursUntil = (at: Date) => Math.max(1, Math.ceil((at.getTime() - Date.now()) / 3_600_000));

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
    if (!this.config.payoutsEnabled) return 0;
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

  /**
   * Batch payout of one user, at MIN_PAYOUT_XOF. True if a transfer was started.
   * Throws `payoutsSuspended()` while payouts are stopped, before anything is written.
   */
  async payUser(userId: string): Promise<boolean> {
    const attempt = await this.attemptPayout(userId, this.config.minPayoutXof);
    if (!attempt.ok && attempt.reason === 'SUSPENDED') throw payoutsSuspended();
    return attempt.ok;
  }

  /**
   * Instant payout (POST /me/payouts/instant): the whole balance at once, from
   * INSTANT_PAYOUT_MIN_XOF, for free. Same checks and ledger entries as the batch; a refusal
   * becomes a business error the app can read aloud.
   */
  async payNow(userId: string): Promise<PayoutView> {
    const attempt = await this.attemptPayout(userId, this.config.instantPayoutMinXof);
    if (!attempt.ok) throw this.refusalError(attempt);
    const payout = await this.prisma.payout.findUniqueOrThrow({ where: { id: attempt.payout.id } });
    return { id: payout.id, amountXof: payout.amountXof, status: payout.status, operator: payout.operator };
  }

  /**
   * Starts a transfer of the user's whole balance if it reaches `minXof`, or says why not.
   * Every check runs inside the transaction, under the user's row lock, so concurrent calls
   * (batch, admin run, instant) can never start two transfers for the same money.
   */
  async attemptPayout(userId: string, minXof: number): Promise<PayoutAttempt> {
    const attempt = await this.prisma.$transaction(async (tx): Promise<PayoutAttempt> => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!this.config.payoutsEnabled) return { ok: false, reason: 'SUSPENDED' };
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.disabledAt) return { ok: false, reason: 'ACCOUNT_DISABLED' };
      if (!user.payoutOperator || !user.payoutPhone) return { ok: false, reason: 'NO_METHOD' };
      if (user.payoutHoldUntil && user.payoutHoldUntil > new Date()) {
        return { ok: false, reason: 'COOLDOWN', retryAt: user.payoutHoldUntil };
      }

      // Checked before the threshold: right after a payout the balance is 0, and the user must
      // hear that a transfer is on its way, not that their balance is too low.
      const inFlight = await tx.payout.count({ where: { userId, status: PayoutStatus.PENDING } });
      if (inFlight > 0) return { ok: false, reason: 'IN_PROGRESS' };
      const recentFailure = await tx.payout.findFirst({
        where: { userId, status: PayoutStatus.FAILED, updatedAt: { gt: new Date(Date.now() - FAILED_PAYOUT_COOLDOWN_MS) } },
        orderBy: { updatedAt: 'desc' },
      });
      if (recentFailure) {
        return { ok: false, reason: 'RECENT_FAILURE', retryAt: new Date(recentFailure.updatedAt.getTime() + FAILED_PAYOUT_COOLDOWN_MS) };
      }

      const balance = await this.ledger.balance(Accounts.payable(userId).code, tx);
      if (balance <= 0 || balance < minXof) return { ok: false, reason: 'TOO_LOW', balanceXof: balance };

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
      return { ok: true, payout: created };
    });
    if (attempt.ok) await this.send(attempt.payout);
    return attempt;
  }

  /**
   * Hands the transfer to the provider (`payoutId` is the idempotency key). Only an explicit
   * rejection gives the money back: any other error is ambiguous (the transfer may have gone
   * through), so the payout stays PENDING, which also blocks a second transfer, until a webhook
   * or the reconciliation settles it.
   */
  private async send(payout: Payout) {
    let providerRef: string;
    try {
      ({ providerRef } = await this.provider.createPayout({
        payoutId: payout.id,
        amountXof: payout.amountXof,
        operator: payout.operator,
        phone: payout.phone,
      }));
    } catch (err) {
      if (err instanceof PayoutRejectedError) {
        this.logger.error(`payout ${payout.id} rejected by provider: ${String(err)}`);
        await this.fail(payout.id, 'provider_error');
      } else {
        this.logger.error(`payout ${payout.id}: provider outcome unknown, left PENDING for reconciliation: ${String(err)}`);
      }
      return;
    }
    // The transfer is accepted: from here on, never reverse it because of our own storage error.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.prisma.payout.update({ where: { id: payout.id }, data: { providerRef } });
        return;
      } catch (err) {
        this.logger.error(`payout ${payout.id}: could not save providerRef ${providerRef} (attempt ${attempt}): ${String(err)}`);
      }
    }
  }

  /** The error contract of epic #3: a stable code and a plain French message. */
  private refusalError(refusal: Extract<PayoutAttempt, { ok: false }>): HttpException {
    switch (refusal.reason) {
      case 'SUSPENDED':
        return payoutsSuspended();
      case 'ACCOUNT_DISABLED':
        return new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Compte désactivé.' });
      case 'NO_METHOD':
        return new BadRequestException({
          code: 'PAYOUT_METHOD_REQUIRED',
          message: 'Ajoutez d’abord votre numéro mobile money dans votre profil.',
        });
      case 'COOLDOWN':
        return new ConflictException({
          code: 'PAYOUT_COOLDOWN',
          message: `Votre numéro de paiement a changé récemment. Pour votre sécurité, les retraits reprennent dans ${hoursUntil(refusal.retryAt!)} h.`,
        });
      case 'RECENT_FAILURE':
        return new ConflictException({
          code: 'PAYOUT_COOLDOWN',
          message: `Votre dernier versement a échoué. Vous pourrez réessayer dans ${hoursUntil(refusal.retryAt!)} h.`,
        });
      case 'IN_PROGRESS':
        return new ConflictException({
          code: 'PAYOUT_IN_PROGRESS',
          message: 'Un versement est déjà en cours. Attendez qu’il arrive avant d’en demander un autre.',
        });
      case 'TOO_LOW':
        return new BadRequestException({
          code: 'INSTANT_PAYOUT_TOO_LOW',
          message: `Le retrait immédiat est possible à partir de ${formatXof(this.config.instantPayoutMinXof)}. `
            + `Votre solde est de ${formatXof(Math.max(0, refusal.balanceXof ?? 0))}.`,
        });
    }
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
      if (payout.status === PayoutStatus.FAILED) {
        this.logger.error(`payout ${payout.id}: provider reports SUCCEEDED after it was reversed. Money may be paid twice: check by hand.`);
      }
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
