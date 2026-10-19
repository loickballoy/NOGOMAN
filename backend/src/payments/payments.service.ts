import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EngagementStatus, JobStatus, PaymentStatus, Prisma, User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { normalizePhone } from '../common/phone';
import { Accounts, LedgerService } from '../ledger/ledger.service';
import { PayoutsService } from '../payouts/payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { planUnits, unitsFees, unitsTotal } from '../work/work-units';
import { FundJobDto } from './dto';
import { PAYMENT_PROVIDER, PaymentProvider, WebhookEvent } from './providers/payment-provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutsService,
    private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** What the farmer will pay to secure every hired-but-unfunded worker on the job. */
  async quote(farmer: User, jobId: string) {
    const { job, engagements } = await this.unfunded(farmer, jobId);
    const units = engagements.flatMap((e) => planUnits(job, e, this.config));
    const total = unitsTotal(units);
    const feeXof = unitsFees(units);
    return {
      jobId,
      workers: engagements.length,
      unitsPerWorker: job.payMode === 'DAILY' ? job.durationDays : 1,
      rateXof: job.rateXof,
      subtotalXof: total - feeXof,
      feeXof,
      feeBps: this.config.farmerFeeBps,
      totalXof: total,
    };
  }

  async fund(farmer: User, jobId: string, dto: FundJobDto) {
    const { job, engagements } = await this.unfunded(farmer, jobId);
    if (engagements.length === 0) {
      throw new BadRequestException({ code: 'NOTHING_TO_FUND', message: 'Aucun travailleur embauché à payer.' });
    }
    const pending = engagements.find((e) => e.payment?.status === PaymentStatus.PENDING)?.payment;
    if (pending) return pending;

    const phone = dto.phone ? normalizePhone(dto.phone, this.config.allowedCountries) : undefined;
    if (dto.operator && !phone) {
      throw new BadRequestException({ code: 'PHONE_REQUIRED', message: 'Indiquez le numéro mobile money qui paie.' });
    }
    const units = engagements.flatMap((e) => planUnits(job, e, this.config));
    const payment = await this.prisma.payment.create({
      data: {
        payerId: farmer.id,
        jobId,
        provider: this.provider.name,
        operator: dto.operator,
        phone,
        amountXof: unitsTotal(units),
        feeXof: unitsFees(units),
        engagements: { connect: engagements.map((e) => ({ id: e.id })) },
      },
    });
    // Refunds go back to the number that paid, unless the farmer set another one.
    if (dto.operator && phone && !farmer.payoutOperator) {
      await this.prisma.user.update({ where: { id: farmer.id }, data: { payoutOperator: dto.operator, payoutPhone: phone } });
    }

    try {
      const res = await this.provider.createCollection({
        paymentId: payment.id,
        amountXof: payment.amountXof,
        operator: dto.operator,
        phone,
        description: `Nogoman · ${job.title}`,
      });
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerRef: res.providerRef, checkoutUrl: res.checkoutUrl },
      });
    } catch (err) {
      this.logger.error(`collection ${payment.id} failed to start: ${String(err)}`);
      await this.failCollection(payment.id, 'provider_error');
      throw new BadRequestException({ code: 'PAYMENT_START_FAILED', message: 'Le paiement n’a pas pu démarrer. Réessayez.' });
    }
  }

  async getPayment(user: User, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException();
    if (payment.payerId !== user.id) throw new ForbiddenException();
    return payment;
  }

  async handleWebhook(providerName: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    if (providerName !== this.provider.name) throw new NotFoundException();
    const event = this.provider.parseWebhook(headers, rawBody);
    try {
      await this.prisma.webhookEvent.create({
        data: { provider: providerName, eventId: event.eventId, payload: event as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { duplicate: true };
      throw err;
    }
    await this.applyEvent(event);
    return { ok: true };
  }

  async applyEvent(event: WebhookEvent) {
    if (event.kind === 'payout') return this.payouts.settle(event.providerRef, event.status, event.reason);
    const payment = await this.prisma.payment.findUnique({ where: { providerRef: event.providerRef } });
    if (!payment) {
      this.logger.warn(`webhook for unknown collection ${event.providerRef}`);
      return;
    }
    if (event.status === 'SUCCEEDED') return this.settleCollection(payment.id);
    return this.failCollection(payment.id, event.reason ?? 'declined');
  }

  private async settleCollection(paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.SUCCEEDED },
      });
      if (claimed.count !== 1) return;

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { job: true, engagements: true },
      });
      const job = payment.job;
      await this.ledger.post(tx, 'FUNDING', `funding:${payment.id}`, [
        { account: Accounts.clearing(payment.provider), amountXof: -payment.amountXof },
        { account: Accounts.escrow(job.id), amountXof: payment.amountXof },
      ], `Séquestre ${job.title}`);

      let allocated = 0;
      for (const engagement of payment.engagements) {
        if (engagement.status !== EngagementStatus.AWAITING_FUNDING) continue;
        const units = planUnits(job, engagement, this.config);
        allocated += unitsTotal(units);
        await tx.workUnit.createMany({ data: units.map((u) => ({ ...u, engagementId: engagement.id })) });
        await tx.engagement.update({ where: { id: engagement.id }, data: { status: EngagementStatus.ACTIVE } });
      }

      // Anything not backing a unit (an engagement cancelled while the payment was pending,
      // or units planned on a later day than quoted) goes straight back to the farmer.
      const leftover = payment.amountXof - allocated;
      if (leftover !== 0) {
        await this.ledger.post(tx, 'REFUND', `funding-leftover:${payment.id}`, [
          { account: Accounts.escrow(job.id), amountXof: -leftover },
          { account: Accounts.payable(payment.payerId), amountXof: leftover },
        ], 'Remboursement du surplus de séquestre');
      }

      if (job.status === JobStatus.FILLED) {
        await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.IN_PROGRESS } });
      }
    });
  }

  private async failCollection(paymentId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, failureReason: reason },
      });
      if (claimed.count !== 1) return;
      await tx.engagement.updateMany({
        where: { paymentId, status: EngagementStatus.AWAITING_FUNDING },
        data: { paymentId: null },
      });
    });
  }

  private async unfunded(farmer: User, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException();
    if (job.farmerId !== farmer.id) throw new ForbiddenException();
    const engagements = await this.prisma.engagement.findMany({
      where: { jobId, status: EngagementStatus.AWAITING_FUNDING },
      include: { payment: true },
      orderBy: { createdAt: 'asc' },
    });
    return { job, engagements };
  }
}
