import { farmerCost, feeFor, formatXof, unitAmounts, workerNet } from './money';

describe('fees', () => {
  it('takes 2% on each side of a 4 500 FCFA day', () => {
    const u = unitAmounts(4500, 200, 200);
    expect(u).toEqual({ grossXof: 4500, farmerFeeXof: 90, workerFeeXof: 90 });
    expect(farmerCost(u)).toBe(4590);
    expect(workerNet(u)).toBe(4410);
  });

  it('takes 5% from the farmer and 3% from the worker on a 4 000 FCFA day', () => {
    const u = unitAmounts(4000, 500, 300);
    expect(u).toEqual({ grossXof: 4000, farmerFeeXof: 200, workerFeeXof: 120 });
    expect(farmerCost(u)).toBe(4200);
    expect(workerNet(u)).toBe(3880);
  });

  it('rounds half up to the franc', () => {
    expect(feeFor(125, 200)).toBe(3); // 2.5 -> 3
    expect(feeFor(124, 200)).toBe(2); // 2.48 -> 2
    expect(feeFor(0, 200)).toBe(0);
  });

  it('supports a zero fee', () => {
    expect(feeFor(4500, 0)).toBe(0);
  });

  it('rejects fractional amounts', () => {
    expect(() => feeFor(10.5, 200)).toThrow();
  });
});

describe('formatXof', () => {
  it('groups thousands with spaces, as said aloud', () => {
    expect(formatXof(0)).toBe('0 FCFA');
    expect(formatXof(999)).toBe('999 FCFA');
    expect(formatXof(10_000)).toBe('10 000 FCFA');
    expect(formatXof(1_234_567)).toBe('1 234 567 FCFA');
  });
});
