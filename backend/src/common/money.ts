/** Fee in XOF for a gross amount, rounded half-up to the franc. */
export function feeFor(grossXof: number, bps: number): number {
  if (!Number.isInteger(grossXof) || grossXof < 0) throw new Error('grossXof must be a non-negative integer');
  return Math.floor((grossXof * bps + 5000) / 10000);
}

export interface UnitAmounts {
  grossXof: number;
  farmerFeeXof: number;
  workerFeeXof: number;
}

export function unitAmounts(grossXof: number, farmerFeeBps: number, workerFeeBps: number): UnitAmounts {
  return {
    grossXof,
    farmerFeeXof: feeFor(grossXof, farmerFeeBps),
    workerFeeXof: feeFor(grossXof, workerFeeBps),
  };
}

/** What the farmer pays into escrow for a unit. */
export const farmerCost = (u: UnitAmounts) => u.grossXof + u.farmerFeeXof;
/** What the worker receives for a unit. */
export const workerNet = (u: UnitAmounts) => u.grossXof - u.workerFeeXof;

/** "10 000 FCFA": an amount as it is written and read aloud in French. */
export function formatXof(amountXof: number): string {
  return `${String(amountXof).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}
