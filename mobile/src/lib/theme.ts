// Design tokens from the Nogoman design direction: ink + white, one green for money and trust.
export const colors = {
  ink: '#111312',
  ink2: '#3C4240',
  muted: '#5E6663',
  line: '#E3E5E3',
  field: '#F3F4F2',
  canvas: '#F7F8F6',
  white: '#FFFFFF',
  green: '#0E7C4A',
  greenText: '#0B5C37',
  greenSoft: '#E3F2EA',
  pendingText: '#9A5B00',
  pendingSoft: '#FFF1DC',
  alertText: '#B3261E',
  alertSoft: '#FDE7E4',
  onInkMuted: '#C9CDCB',
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/** Body text never goes below 15, labels never below 13. */
export const type = {
  hero: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, lineHeight: 36 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 23 },
  bodyStrong: { fontSize: 17, fontWeight: '700' },
  small: { fontSize: 15, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600' },
  tiny: { fontSize: 13, fontWeight: '600' },
  amount: { fontSize: 44, fontWeight: '800', letterSpacing: -0.8 },
} as const;

/** Thumb-sized: main actions are 56 high, everything tappable at least 44. */
export const touch = { primary: 56, min: 44 } as const;
