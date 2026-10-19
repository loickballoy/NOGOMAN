import { Job, User } from '@prisma/client';
import { workerNet, unitAmounts } from '../common/money';
import { isoDate } from '../common/time';
import { presentPublic } from '../users/user.presenter';

export interface FeeRates {
  farmerFeeBps: number;
  workerFeeBps: number;
}

/**
 * exactLocation: only the owner and hired workers get exact coordinates;
 * everyone else gets them rounded to ~1 km.
 */
export function presentJob(
  job: Job & { farmer: User },
  opts: FeeRates & { slotsTaken: number; exactLocation: boolean; distanceKm?: number },
) {
  const unit = unitAmounts(job.rateXof, opts.farmerFeeBps, opts.workerFeeBps);
  const units = job.payMode === 'DAILY' ? job.durationDays : 1;
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    crop: job.crop,
    payMode: job.payMode,
    rateXof: job.rateXof,
    workerNetXof: workerNet(unit),
    workerTotalNetXof: workerNet(unit) * units,
    workersNeeded: job.workersNeeded,
    slotsLeft: Math.max(0, job.workersNeeded - opts.slotsTaken),
    durationDays: job.durationDays,
    startDate: isoDate(job.startDate),
    locality: job.locality,
    address: opts.exactLocation ? job.address : null,
    locationVerified: job.locationVerified,
    lat: opts.exactLocation ? job.lat : round(job.lat),
    lng: opts.exactLocation ? job.lng : round(job.lng),
    distanceKm: opts.distanceKm === undefined ? undefined : Math.round(opts.distanceKm * 10) / 10,
    status: job.status,
    farmer: presentPublic(job.farmer),
    createdAt: job.createdAt,
  };
}
