import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ApplicationStatus, EngagementStatus, JobStatus, PayMode, User, WorkUnit, WorkUnitStatus,
} from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { haversineKm } from '../common/geo';
import { addHours, isoDate, sameDay, todayLocal } from '../common/time';
import { Accounts, LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { presentPublic } from '../users/user.presenter';
import { Tx } from './work-units';

const TERMINAL: WorkUnitStatus[] = ['RELEASED', 'MISSED', 'CANCELLED', 'REFUNDED'];

@Injectable()
export class WorkService {
  private readonly logger = new Logger(WorkService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: AppConfig,
  ) {}

  // ---- reads -------------------------------------------------------------

  async listMine(user: User) {
    const engagements = await this.prisma.engagement.findMany({
      where: user.role === 'FARMER' ? { job: { farmerId: user.id } } : { workerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { job: { include: { farmer: true } }, worker: true, workUnits: { orderBy: { index: 'asc' } } },
    });
    return engagements.map((e) => this.presentEngagement(e, user));
  }

  async get(user: User, engagementId: string) {
    const e = await this.prisma.engagement.findUnique({
      where: { id: engagementId },
      include: { job: { include: { farmer: true } }, worker: true, workUnits: { orderBy: { index: 'asc' } } },
    });
    if (!e) throw new NotFoundException();
    if (e.workerId !== user.id && e.job.farmerId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException();
    return this.presentEngagement(e, user);
  }

  private presentEngagement(e: any, viewer: User) {
    const units: WorkUnit[] = e.workUnits;
    const sum = (pred: (u: WorkUnit) => boolean, f: (u: WorkUnit) => number) =>
      units.filter(pred).reduce((s, u) => s + f(u), 0);
    const isWorker = viewer.id === e.workerId;
    return {
      id: e.id,
      status: e.status,
      payMode: e.payMode,
      rateXof: e.rateXof,
      job: { id: e.job.id, title: e.job.title, locality: e.job.locality, lat: e.job.lat, lng: e.job.lng },
      farmer: presentPublic(e.job.farmer),
      worker: presentPublic(e.worker),
      totals: isWorker
        ? {
            earnedXof: sum((u) => u.status === 'RELEASED', (u) => u.grossXof - u.workerFeeXof),
            upcomingXof: sum((u) => u.status === 'PENDING' || u.status === 'DISPUTED', (u) => u.grossXof - u.workerFeeXof),
          }
        : {
            heldXof: sum((u) => u.status === 'PENDING' || u.status === 'DISPUTED', (u) => u.grossXof + u.farmerFeeXof),
            releasedXof: sum((u) => u.status === 'RELEASED', (u) => u.grossXof + u.farmerFeeXof),
            refundedXof: sum((u) => ['MISSED', 'CANCELLED', 'REFUNDED'].includes(u.status), (u) => u.grossXof + u.farmerFeeXof),
          },
      units: units.map((u) => ({
        id: u.id,
        index: u.index,
        workDate: isoDate(u.workDate),
        status: u.status,
        amountXof: isWorker ? u.grossXof - u.workerFeeXof : u.grossXof + u.farmerFeeXof,
        checkedInAt: u.checkInAt,
        completedAt: u.completedAt,
        autoReleaseAt: u.autoReleaseAt,
        releasedAt: u.releasedAt,
        disputeReason: u.disputeReason,
      })),
    };
  }

  // ---- worker actions ----------------------------------------------------

  async checkIn(worker: User, unitId: string, lat: number, lng: number) {
    const unit = await this.unitFor(unitId);
    if (unit.engagement.workerId !== worker.id) throw new ForbiddenException();
    this.assertOpen(unit);
    if (unit.engagement.payMode === PayMode.DAILY && !sameDay(unit.workDate, new Date())) {
      throw new BadRequestException({ code: 'NOT_TODAY', message: "Le pointage se fait le jour même." });
    }
    const distance = haversineKm(lat, lng, unit.engagement.job.lat, unit.engagement.job.lng);
    if (distance > this.config.checkInRadiusKm) {
      throw new BadRequestException({
        code: 'TOO_FAR',
        message: `Vous êtes à ${distance.toFixed(1)} km de la plantation. Rapprochez-vous pour pointer.`,
      });
    }
    if (unit.checkInAt) return { id: unit.id, checkedInAt: unit.checkInAt };
    const updated = await this.prisma.workUnit.update({
      where: { id: unit.id },
      data: { checkInAt: new Date(), checkInLat: lat, checkInLng: lng },
    });
    return { id: updated.id, checkedInAt: updated.checkInAt };
  }

  /** TASK only: the worker says the task is finished; the farmer then has a window to object. */
  async markTaskDone(worker: User, unitId: string) {
    const unit = await this.unitFor(unitId);
    if (unit.engagement.workerId !== worker.id) throw new ForbiddenException();
    if (unit.engagement.payMode !== PayMode.TASK) {
      throw new BadRequestException({ code: 'NOT_A_TASK', message: 'Réservé aux missions à la tâche.' });
    }
    this.assertOpen(unit);
    if (unit.completedAt) return { id: unit.id, autoReleaseAt: unit.autoReleaseAt };
    const now = new Date();
    const updated = await this.prisma.workUnit.update({
      where: { id: unit.id },
      data: { completedAt: now, autoReleaseAt: addHours(now, this.config.taskAutoReleaseHours) },
    });
    return { id: updated.id, autoReleaseAt: updated.autoReleaseAt };
  }

  // ---- farmer actions ----------------------------------------------------

  async confirm(farmer: User, unitId: string) {
    const unit = await this.unitFor(unitId);
    if (unit.engagement.job.farmerId !== farmer.id) throw new ForbiddenException();
    this.assertOpen(unit);
    if (unit.engagement.payMode === PayMode.DAILY && unit.workDate > todayLocal()) {
      throw new BadRequestException({ code: 'FUTURE_DAY', message: 'Cette journée n’a pas encore eu lieu.' });
    }
    await this.release(unit.id, 'farmer');
    return this.get(farmer, unit.engagementId);
  }

  /** Confirms the given day for every worker on the job: the "Confirmer la journée" button. */
  async confirmDay(farmer: User, jobId: string, date: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException();
    if (job.farmerId !== farmer.id) throw new ForbiddenException();
    const day = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(day.getTime()) || day > todayLocal()) {
      throw new BadRequestException({ code: 'FUTURE_DAY', message: 'Cette journée n’a pas encore eu lieu.' });
    }
    const units = await this.prisma.workUnit.findMany({
      where: { workDate: day, status: WorkUnitStatus.PENDING, engagement: { jobId, status: EngagementStatus.ACTIVE } },
    });
    let releasedXof = 0;
    for (const u of units) {
      if (await this.release(u.id, 'farmer')) releasedXof += u.grossXof;
    }
    return { date, workers: units.length, releasedXof };
  }

  async dispute(user: User, unitId: string, reason: string) {
    const unit = await this.unitFor(unitId);
    const isParty = unit.engagement.workerId === user.id || unit.engagement.job.farmerId === user.id;
    if (!isParty) throw new ForbiddenException();
    const res = await this.prisma.workUnit.updateMany({
      where: { id: unit.id, status: WorkUnitStatus.PENDING },
      data: { status: WorkUnitStatus.DISPUTED, disputeReason: reason.trim(), disputedById: user.id },
    });
    if (res.count !== 1) throw new BadRequestException({ code: 'NOT_DISPUTABLE', message: 'Cette journée est déjà réglée.' });
    return this.get(user, unit.engagementId);
  }

  /**
   * Ends an engagement early. Days that haven't started are refunded to the farmer;
   * today's and past days still follow the normal confirm / auto-release rules.
   */
  async cancel(user: User, engagementId: string) {
    const e = await this.prisma.engagement.findUnique({ where: { id: engagementId }, include: { job: true } });
    if (!e) throw new NotFoundException();
    if (e.workerId !== user.id && e.job.farmerId !== user.id) throw new ForbiddenException();
    if (e.status === EngagementStatus.COMPLETED || e.status === EngagementStatus.CANCELLED) {
      throw new BadRequestException({ code: 'ALREADY_ENDED', message: 'Cette mission est déjà terminée.' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.engagement.update({ where: { id: e.id }, data: { status: EngagementStatus.CANCELLED } });
      await tx.application.update({
        where: { id: e.applicationId },
        data: { status: user.id === e.workerId ? ApplicationStatus.WITHDRAWN : ApplicationStatus.REJECTED },
      });
      const future = await tx.workUnit.findMany({
        where: { engagementId: e.id, status: WorkUnitStatus.PENDING, workDate: { gt: todayLocal() }, checkInAt: null },
      });
      for (const u of future) await this.refund(tx, u, WorkUnitStatus.CANCELLED);
      // The freed slot can be refilled as long as the job hasn't started.
      const filled = e.job.status === JobStatus.FILLED || e.job.status === JobStatus.IN_PROGRESS;
      if (filled && e.job.startDate >= todayLocal()) {
        await tx.job.update({ where: { id: e.jobId }, data: { status: JobStatus.OPEN } });
      }
      await this.finalize(tx, e.id);
    });
    return this.get(user, engagementId);
  }

  // ---- admin -------------------------------------------------------------

  async resolveDispute(unitId: string, outcome: 'RELEASE' | 'REFUND') {
    const unit = await this.prisma.workUnit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException();
    if (unit.status !== WorkUnitStatus.DISPUTED) {
      throw new BadRequestException({ code: 'NOT_DISPUTED', message: 'Pas de litige sur cette unité.' });
    }
    if (outcome === 'RELEASE') {
      await this.release(unit.id, 'admin', [WorkUnitStatus.DISPUTED]);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.workUnit.updateMany({
          where: { id: unit.id, status: WorkUnitStatus.DISPUTED },
          data: { status: WorkUnitStatus.REFUNDED },
        });
        if (claimed.count !== 1) return;
        await this.postRefund(tx, unit);
        await this.finalize(tx, unit.engagementId);
      });
    }
    return this.prisma.workUnit.findUniqueOrThrow({ where: { id: unitId } });
  }

  // ---- automatic release -------------------------------------------------

  @Cron('*/5 * * * *')
  async scheduled() {
    if (!this.config.cronEnabled || this.running) return;
    this.running = true;
    try {
      await this.autoRelease();
    } catch (err) {
      this.logger.error(`auto-release failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Pays units the farmer didn't confirm in time. A day with no GPS check-in and no
   * confirmation is treated as not worked and refunded to the farmer.
   */
  async autoRelease(now: Date = new Date()) {
    const due = await this.prisma.workUnit.findMany({
      where: { status: WorkUnitStatus.PENDING, autoReleaseAt: { lte: now }, engagement: { status: { in: ['ACTIVE', 'CANCELLED'] } } },
      include: { engagement: true },
      take: 500,
    });
    let released = 0;
    let missed = 0;
    for (const u of due) {
      if (u.engagement.payMode === PayMode.DAILY && !u.checkInAt) {
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.workUnit.findUniqueOrThrow({ where: { id: u.id } });
          if (current.status !== WorkUnitStatus.PENDING) return;
          await this.refund(tx, current, WorkUnitStatus.MISSED);
          await this.finalize(tx, u.engagementId);
        });
        missed++;
      } else if (await this.release(u.id, 'auto')) {
        released++;
      }
    }
    return { released, missed };
  }

  // ---- money movements ---------------------------------------------------

  /** Moves one unit from escrow to the worker (net) and Nogoman (both fees). Idempotent. */
  async release(unitId: string, by: 'farmer' | 'auto' | 'admin', from: WorkUnitStatus[] = [WorkUnitStatus.PENDING]) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workUnit.updateMany({
        where: { id: unitId, status: { in: from } },
        data: {
          status: WorkUnitStatus.RELEASED,
          releasedAt: new Date(),
          confirmedAt: by === 'farmer' ? new Date() : undefined,
        },
      });
      if (claimed.count !== 1) return false;
      const unit = await tx.workUnit.findUniqueOrThrow({ where: { id: unitId }, include: { engagement: true } });
      const { jobId, workerId } = unit.engagement;
      await this.ledger.post(tx, 'RELEASE', `release:${unit.id}`, [
        { account: Accounts.escrow(jobId), amountXof: -(unit.grossXof + unit.farmerFeeXof) },
        { account: Accounts.payable(workerId), amountXof: unit.grossXof - unit.workerFeeXof },
        { account: Accounts.revenue(), amountXof: unit.farmerFeeXof + unit.workerFeeXof },
      ], `Jour ${unit.index + 1} (${by})`);
      await this.finalize(tx, unit.engagementId);
      return true;
    });
  }

  private async refund(tx: Tx, unit: WorkUnit, status: WorkUnitStatus) {
    const claimed = await tx.workUnit.updateMany({ where: { id: unit.id, status: WorkUnitStatus.PENDING }, data: { status } });
    if (claimed.count !== 1) return;
    await this.postRefund(tx, unit);
  }

  private async postRefund(tx: Tx, unit: WorkUnit) {
    const engagement = await tx.engagement.findUniqueOrThrow({ where: { id: unit.engagementId }, include: { job: true } });
    await this.ledger.post(tx, 'REFUND', `refund:${unit.id}`, [
      { account: Accounts.escrow(engagement.jobId), amountXof: -(unit.grossXof + unit.farmerFeeXof) },
      { account: Accounts.payable(engagement.job.farmerId), amountXof: unit.grossXof + unit.farmerFeeXof },
    ], `Remboursement jour ${unit.index + 1}`);
  }

  /** Closes the engagement (and the job) once nothing is left to pay or refund. */
  private async finalize(tx: Tx, engagementId: string) {
    const open = await tx.workUnit.count({ where: { engagementId, status: { notIn: TERMINAL } } });
    if (open > 0) return;
    const e = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } });
    if (e.status === EngagementStatus.ACTIVE) {
      await tx.engagement.update({ where: { id: e.id }, data: { status: EngagementStatus.COMPLETED, completedAt: new Date() } });
    } else if (e.status === EngagementStatus.CANCELLED && !e.completedAt) {
      await tx.engagement.update({ where: { id: e.id }, data: { completedAt: new Date() } });
    }
    const stillRunning = await tx.engagement.count({
      where: { jobId: e.jobId, status: { in: [EngagementStatus.ACTIVE, EngagementStatus.AWAITING_FUNDING] } },
    });
    const job = await tx.job.findUniqueOrThrow({ where: { id: e.jobId } });
    if (stillRunning === 0 && (job.status === JobStatus.IN_PROGRESS || job.status === JobStatus.FILLED)) {
      await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.COMPLETED } });
    }
  }

  private async unitFor(unitId: string) {
    const unit = await this.prisma.workUnit.findUnique({
      where: { id: unitId },
      include: { engagement: { include: { job: true } } },
    });
    if (!unit) throw new NotFoundException();
    return unit;
  }

  private assertOpen(unit: WorkUnit & { engagement: { status: EngagementStatus } }) {
    if (unit.status !== WorkUnitStatus.PENDING) {
      throw new BadRequestException({ code: 'UNIT_CLOSED', message: 'Cette journée est déjà réglée.' });
    }
    if (unit.engagement.status !== EngagementStatus.ACTIVE && unit.engagement.status !== EngagementStatus.CANCELLED) {
      throw new BadRequestException({ code: 'NOT_ACTIVE', message: "La mission n'est pas active." });
    }
  }
}
