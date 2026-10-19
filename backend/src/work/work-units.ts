import { Engagement, Job, PayMode, Prisma } from '@prisma/client';
import { unitAmounts } from '../common/money';
import { addDays, dailyAutoReleaseAt, todayLocal } from '../common/time';

export interface PlannedUnit {
  index: number;
  workDate: Date;
  grossXof: number;
  farmerFeeXof: number;
  workerFeeXof: number;
  autoReleaseAt: Date | null;
}

/** The payable units an engagement will produce once funded. */
export function planUnits(
  job: Pick<Job, 'startDate' | 'payMode'>,
  engagement: Pick<Engagement, 'rateXof' | 'unitCount'>,
  fees: { farmerFeeBps: number; workerFeeBps: number; autoReleaseHourUtc: number },
  now: Date = new Date(),
): PlannedUnit[] {
  const today = todayLocal(now);
  const start = job.startDate > today ? job.startDate : today;
  const amounts = unitAmounts(engagement.rateXof, fees.farmerFeeBps, fees.workerFeeBps);
  if (job.payMode === PayMode.TASK) {
    return [{ index: 0, workDate: start, ...amounts, autoReleaseAt: null }];
  }
  return Array.from({ length: engagement.unitCount }, (_, i) => {
    const workDate = addDays(start, i);
    return { index: i, workDate, ...amounts, autoReleaseAt: dailyAutoReleaseAt(workDate, fees.autoReleaseHourUtc) };
  });
}

export const unitsTotal = (units: PlannedUnit[]) => units.reduce((s, u) => s + u.grossXof + u.farmerFeeXof, 0);
export const unitsFees = (units: PlannedUnit[]) => units.reduce((s, u) => s + u.farmerFeeXof, 0);

export type Tx = Prisma.TransactionClient;
