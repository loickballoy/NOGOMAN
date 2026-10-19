import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, EngagementStatus, JobStatus, MessageKind, PaymentStatus, PayoutStatus, User } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { SMS_PROVIDER, SmsProvider } from '../auth/sms/sms.provider';
import { AppConfig } from '../config/app-config';
import { normalizePhone } from '../common/phone';
import { Accounts, LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly ledger: LedgerService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async updateMe(user: User, dto: UpdateMeDto) {
    if (dto.role && user.role && dto.role !== user.role) {
      throw new BadRequestException({ code: 'ROLE_LOCKED', message: 'Le type de compte ne peut pas être changé.' });
    }
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException({ code: 'LOCATION_INCOMPLETE', message: 'lat et lng vont ensemble.' });
    }
    const payoutPhone = dto.payoutPhone ? normalizePhone(dto.payoutPhone, this.config.allowedCountries) : undefined;
    // Changing where the money goes is what an account thief does first: hold payouts and
    // warn the owner by SMS. Setting the first number, or re-saving the same one, is free.
    const payoutChanged = Boolean(user.payoutPhone) && (
      (payoutPhone !== undefined && payoutPhone !== user.payoutPhone)
      || (dto.payoutOperator !== undefined && dto.payoutOperator !== user.payoutOperator));
    const holdUntil = payoutChanged ? new Date(Date.now() + this.config.payoutHoldHours * 3600 * 1000) : undefined;

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: dto.name?.trim(),
        role: user.role ? undefined : dto.role,
        bio: dto.bio,
        locality: dto.locality,
        lat: dto.lat,
        lng: dto.lng,
        payoutOperator: dto.payoutOperator,
        payoutPhone,
        payoutHoldUntil: holdUntil,
      },
    });
    if (payoutChanged) {
      this.logger.warn(`user ${user.id} changed payout number: payouts held until ${holdUntil!.toISOString()}`);
      await this.sms.send(user.phone,
        `Nogoman : votre numéro de paiement a été modifié. Les versements reprennent dans ${this.config.payoutHoldHours} h. `
        + 'Si ce n’est pas vous, contactez Nogoman tout de suite.').catch(() => undefined);
    }
    return updated;
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.disabledAt) throw new NotFoundException();
    return user;
  }

  /**
   * Deletes the account (App Store rule, and the right to erasure under Ivorian law 2013-450).
   * Personal data is erased; payments, payouts and the ledger stay, without a name attached,
   * because accounting law requires keeping them.
   */
  async deleteMe(user: User) {
    const [engagements, pendingPayments, pendingPayouts, balance] = await Promise.all([
      this.prisma.engagement.count({
        where: {
          status: { in: [EngagementStatus.AWAITING_FUNDING, EngagementStatus.ACTIVE] },
          OR: [{ workerId: user.id }, { job: { farmerId: user.id } }],
        },
      }),
      this.prisma.payment.count({ where: { payerId: user.id, status: PaymentStatus.PENDING } }),
      this.prisma.payout.count({ where: { userId: user.id, status: PayoutStatus.PENDING } }),
      this.ledger.balance(Accounts.payable(user.id).code),
    ]);
    if (engagements > 0 || pendingPayments > 0) {
      throw new BadRequestException({
        code: 'ACTIVE_MISSIONS',
        message: 'Terminez ou annulez vos missions en cours avant de supprimer votre compte.',
      });
    }
    if (pendingPayouts > 0 || balance >= this.config.minPayoutXof) {
      throw new BadRequestException({
        code: 'MONEY_PENDING',
        message: 'De l’argent est en route vers votre compte mobile money. Réessayez une fois le versement reçu.',
      });
    }

    const voiceDir = resolve(this.config.uploadDir, 'voice');
    const voiceFiles = await this.prisma.message.findMany({
      where: { senderId: user.id, audioPath: { not: null } },
      select: { audioPath: true },
    });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.job.updateMany({ where: { farmerId: user.id, status: JobStatus.OPEN }, data: { status: JobStatus.CANCELLED } });
      await tx.application.updateMany({
        where: { workerId: user.id, status: ApplicationStatus.PENDING },
        data: { status: ApplicationStatus.WITHDRAWN },
      });
      await tx.message.updateMany({
        where: { senderId: user.id },
        data: { kind: MessageKind.TEXT, text: 'Message supprimé', audioPath: null, audioMs: null },
      });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          // The number is freed: signing up again with it creates a new, empty account.
          phone: `deleted:${user.id}`,
          name: null,
          bio: null,
          locality: null,
          lat: null,
          lng: null,
          payoutOperator: null,
          payoutPhone: null,
          disabledAt: now,
          deletedAt: now,
        },
      });
    });
    for (const { audioPath } of voiceFiles) {
      const path = join(voiceDir, audioPath!);
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch (err) {
        this.logger.error(`could not delete voice note ${audioPath}: ${String(err)}`);
      }
    }
    this.logger.log(`user ${user.id} deleted their account`);
  }
}
