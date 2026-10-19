import { planUnits, unitsFees, unitsTotal } from './work-units';

const fees = { farmerFeeBps: 200, workerFeeBps: 200, autoReleaseHourUtc: 9 };

describe('planUnits', () => {
  const now = new Date('2026-11-01T15:00:00Z');

  it('plans one unit per day with auto-release the next morning', () => {
    const units = planUnits(
      { startDate: new Date('2026-11-02T00:00:00Z'), payMode: 'DAILY' },
      { rateXof: 4500, unitCount: 3 },
      fees,
      now,
    );
    expect(units.map((u) => u.workDate.toISOString().slice(0, 10))).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(units[0].autoReleaseAt?.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(unitsTotal(units)).toBe(3 * 4590);
    expect(unitsFees(units)).toBe(3 * 90);
  });

  it('starts today when the start date has already passed', () => {
    const units = planUnits(
      { startDate: new Date('2026-10-28T00:00:00Z'), payMode: 'DAILY' },
      { rateXof: 4500, unitCount: 2 },
      fees,
      now,
    );
    expect(units[0].workDate.toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('plans a single unit with no auto-release for a task', () => {
    const units = planUnits(
      { startDate: new Date('2026-11-05T00:00:00Z'), payMode: 'TASK' },
      { rateXof: 25000, unitCount: 1 },
      fees,
      now,
    );
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ grossXof: 25000, farmerFeeXof: 500, workerFeeXof: 500, autoReleaseAt: null });
  });
});
