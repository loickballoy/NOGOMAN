import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Job, JobStatus, Prisma, User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { boundingBox } from '../common/geo';
import { todayLocal } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, SearchJobsDto, UpdateJobDto } from './dto';
import { presentJob } from './job.presenter';

const TAKEN_STATUSES = ['AWAITING_FUNDING', 'ACTIVE', 'COMPLETED'] as const;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService, private readonly config: AppConfig) {}

  private assertStartDate(startDate: string) {
    if (new Date(`${startDate}T00:00:00Z`) < todayLocal()) {
      throw new BadRequestException({ code: 'START_IN_PAST', message: 'La date de début est déjà passée.' });
    }
  }

  async create(farmer: User, dto: CreateJobDto) {
    this.assertStartDate(dto.startDate);
    if (this.config.requireKycToTransact && farmer.kycLevel < 1) {
      throw new ForbiddenException({ code: 'KYC_REQUIRED', message: "Vérifiez votre identité pour publier une offre." });
    }
    const job = await this.prisma.job.create({
      data: {
        farmerId: farmer.id,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        category: dto.category,
        crop: dto.crop,
        payMode: dto.payMode,
        rateXof: dto.rateXof,
        workersNeeded: dto.workersNeeded,
        durationDays: dto.durationDays,
        startDate: new Date(`${dto.startDate}T00:00:00Z`),
        locality: dto.locality.trim(),
        lat: dto.lat,
        lng: dto.lng,
      },
      include: { farmer: true },
    });
    return this.present(job, farmer);
  }

  async search(viewer: User, q: SearchJobsDto) {
    const radiusKm = q.radiusKm ?? 25;
    const box = boundingBox(q.lat, q.lng, radiusKm);
    const rows = await this.prisma.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id, distance FROM (
        SELECT "id",
          6371 * 2 * asin(sqrt(
            power(sin(radians("lat" - ${q.lat}) / 2), 2) +
            cos(radians(${q.lat})) * cos(radians("lat")) * power(sin(radians("lng" - ${q.lng}) / 2), 2)
          )) AS distance
        FROM "Job"
        WHERE "status" = 'OPEN'
          AND "startDate" >= ${todayLocal()}
          AND "lat" BETWEEN ${box.minLat} AND ${box.maxLat}
          AND "lng" BETWEEN ${box.minLng} AND ${box.maxLng}
          ${q.category ? Prisma.sql`AND "category" = ${q.category}::"JobCategory"` : Prisma.empty}
          ${q.payMode ? Prisma.sql`AND "payMode" = ${q.payMode}::"PayMode"` : Prisma.empty}
      ) s
      WHERE distance <= ${radiusKm}
      ORDER BY distance
      LIMIT ${q.limit ?? 30}`;

    const jobs = await this.prisma.job.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { farmer: true, _count: { select: { engagements: { where: { status: { in: [...TAKEN_STATUSES] } } } } } },
    });
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return rows
      .map((r) => {
        const job = byId.get(r.id);
        if (!job) return undefined;
        return presentJob(job, {
          ...this.config,
          slotsTaken: job._count.engagements,
          exactLocation: job.farmerId === viewer.id,
          distanceKm: Number(r.distance),
        });
      })
      .filter((j) => j !== undefined);
  }

  async mine(farmer: User) {
    const jobs = await this.prisma.job.findMany({
      where: { farmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
      include: { farmer: true },
    });
    return Promise.all(jobs.map((j) => this.present(j, farmer)));
  }

  async getForViewer(id: string, viewer: User) {
    const job = await this.prisma.job.findUnique({ where: { id }, include: { farmer: true } });
    if (!job) throw new NotFoundException();
    return this.present(job, viewer);
  }

  async update(id: string, farmer: User, dto: UpdateJobDto) {
    const job = await this.ownedJob(id, farmer);
    const taken = await this.slotsTaken(job.id);
    if (job.status !== JobStatus.OPEN || taken > 0) {
      throw new BadRequestException({ code: 'JOB_LOCKED', message: "L'offre ne peut plus être modifiée après une embauche." });
    }
    if (dto.startDate) this.assertStartDate(dto.startDate);
    const updated = await this.prisma.job.update({
      where: { id },
      data: { ...dto, startDate: dto.startDate ? new Date(`${dto.startDate}T00:00:00Z`) : undefined },
      include: { farmer: true },
    });
    return this.present(updated, farmer);
  }

  async cancel(id: string, farmer: User) {
    const job = await this.ownedJob(id, farmer);
    const active = await this.prisma.engagement.count({ where: { jobId: id, status: 'ACTIVE' } });
    if (active > 0) {
      throw new BadRequestException({
        code: 'JOB_HAS_ACTIVE_WORK',
        message: 'Des travailleurs sont en mission. Terminez ou annulez leurs missions d’abord.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.engagement.updateMany({ where: { jobId: id, status: 'AWAITING_FUNDING' }, data: { status: 'CANCELLED' } }),
      this.prisma.application.updateMany({ where: { jobId: id, status: 'PENDING' }, data: { status: 'REJECTED' } }),
      this.prisma.job.update({ where: { id: job.id }, data: { status: JobStatus.CANCELLED } }),
    ]);
    return this.getForViewer(id, farmer);
  }

  async ownedJob(id: string, farmer: User): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException();
    if (job.farmerId !== farmer.id) throw new ForbiddenException();
    return job;
  }

  slotsTaken(jobId: string) {
    return this.prisma.engagement.count({ where: { jobId, status: { in: [...TAKEN_STATUSES] } } });
  }

  private async present(job: Job & { farmer: User }, viewer: User) {
    const exact =
      job.farmerId === viewer.id ||
      (await this.prisma.engagement.count({ where: { jobId: job.id, workerId: viewer.id, status: { not: 'CANCELLED' } } })) > 0;
    return presentJob(job, { ...this.config, slotsTaken: await this.slotsTaken(job.id), exactLocation: exact });
  }
}
