/** 192780 -> "192 780", grouped with a no-break space so an amount never splits across lines. */
export function fcfa(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

/** 0.2 -> "0,2 km" */
export function km(n: number): string {
  return `${String(n).replace('.', ',')}\u00A0km`;
}

/** "aujourd'hui" -> "Aujourd'hui" for labels that start a line. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "2026-11-02" -> "lun. 2 nov." */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Relative wording reads better aloud than a date: "aujourd'hui", "demain", "dans 5 jours". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  if (diff > 1) return `dans ${diff} jours`;
  return `il y a ${-diff} jours`;
}

/** Today in Abidjan (GMT all year), as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/** Groups an Ivorian number as typed: "0708123456" -> "07 08 12 34 56". */
export function groupPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
