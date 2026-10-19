import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, JobStatus, PayMode, Prisma, User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { presentPublic } from '../users/user.presenter';

const TAKEN = ['AWAITING_FUNDING', 'ACTIVE', 'COMPLETED'] as const;

@Injectable()
export class HiringService {
  constructor(private readonly prisma: PrismaService, private readonly config: AppConfig) {}

  async apply(worker: User, jobId: string, message?: string) {
    if (this.config.requireKycToTransact && worker.kycLevel < 1) {
      throw new ForbiddenException({ code: 'KYC_REQUIRED', message: 'Vérifiez votre identité pour postuler.' });
    }
    if (!worker.payoutOperator || !worker.payoutPhone) {
      throw new BadRequestException({
        code: 'PAYOUT_METHOD_REQUIRED',
        message: 'Ajoutez votre numéro mobile money pour être payé.',
      });
    }
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException();
    if (job.farmerId === worker.id) throw new BadRequestException({ code: 'OWN_JOB', message: 'C’est votre offre.' });
    if (job.status !== JobStatus.OPEN) {
      throw new BadRequestException({ code: 'JOB_NOT_OPEN', message: "Cette offre n'accepte plus de candidatures." });
    }
    try {
      return await this.prisma.application.create({
        data: { jobId, workerId: worker.id, message: message?.trim() || null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_APPLIED', message: 'Vous avez déjà postulé.' });
      }
      throw err;
    }
  }

  async listForJob(farmer: User, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException();
    if (job.farmerId !== farmer.id) throw new ForbiddenException();
    const apps = await this.prisma.application.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      include: { worker: true },
    });
    return apps.map((a) => ({
      id: a.id,
      status: a.status,
      message: a.message,
      createdAt: a.createdAt,
      worker: presentPublic(a.worker),
    }));
  }

  async mine(worker: User) {
    return this.prisma.application.findMany({
      where: { workerId: worker.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, createdAt: true,
        job: { select: { id: true, title: true, locality: true, rateXof: true, payMode: true, startDate: true, status: true } },
        engagement: { select: { id: true, status: true } },
      },
    });
  }

  async withdraw(worker: User, applicationId: string) {
    const res = await this.prisma.application.updateMany({
      where: { id: applicationId, workerId: worker.id, status: ApplicationStatus.PENDING },
      data: { status: ApplicationStatus.WITHDRAWN },
    });
    if (res.count !== 1) throw new BadRequestException({ code: 'NOT_WITHDRAWABLE', message: 'Candidature introuvable ou déjà traitée.' });
    return { id: applicationId, status: ApplicationStatus.WITHDRAWN };
  }

  async reject(farmer: User, applicationId: string) {
    const app = await this.ownedApplication(farmer, applicationId);
    if (app.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException({ code: 'NOT_PENDING', message: 'Candidature déjà traitée.' });
    }
    return this.prisma.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.REJECTED } });
  }

  async hire(farmer: User, applicationId: string) {
    const app = await this.ownedApplication(farmer, applicationId);
    return this.prisma.$transaction(async (tx) => {
      // Serialise hires on the same job so slots can't be oversold.
      await tx.$queryRaw`SELECT "id" FROM "Job" WHERE "id" = ${app.jobId} FOR UPDATE`;
      const job = await tx.job.findUniqueOrThrow({ where: { id: app.jobId } });
      const current = await tx.application.findUniqueOrThrow({ where: { id: app.id } });
      if (current.status !== ApplicationStatus.PENDING) {
        throw new BadRequestException({ code: 'NOT_PENDING', message: 'Candidature déjà traitée.' });
      }
      if (job.status !== JobStatus.OPEN) {
        throw new BadRequestException({ code: 'JOB_NOT_OPEN', message: "L'offre n'est plus ouverte." });
      }
      const taken = await tx.engagement.count({ where: { jobId: job.id, status: { in: [...TAKEN] } } });
      if (taken >= job.workersNeeded) {
        throw new BadRequestException({ code: 'JOB_FULL', message: 'Toutes les places sont prises.' });
      }

      await tx.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.HIRED } });
      const engagement = await tx.engagement.create({
        data: {
          jobId: job.id,
          workerId: app.workerId,
          applicationId: app.id,
          payMode: job.payMode,
          rateXof: job.rateXof,
          unitCount: job.payMode === PayMode.DAILY ? job.durationDays : 1,
        },
      });
      if (taken + 1 >= job.workersNeeded) {
        await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.FILLED } });
      }
      return engagement;
    });
  }

  private async ownedApplication(farmer: User, applicationId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId }, include: { job: true } });
    if (!app) throw new NotFoundException();
    if (app.job.farmerId !== farmer.id) throw new ForbiddenException();
    return app;
  }
}
