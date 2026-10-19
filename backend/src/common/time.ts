// Côte d'Ivoire runs on GMT (Africa/Abidjan) all year, with no daylight saving,
// so a calendar day there is exactly a UTC calendar day.
const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayLocal(now: Date = new Date()): Date {
  return startOfUtcDay(now);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

export function sameDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

/** A daily unit is auto-released the morning after the work day. */
export function dailyAutoReleaseAt(workDate: Date, hourUtc: number): Date {
  return addHours(addDays(startOfUtcDay(workDate), 1), hourUtc);
}

export function isoDate(d: Date): string {
  return startOfUtcDay(d).toISOString().slice(0, 10);
}
