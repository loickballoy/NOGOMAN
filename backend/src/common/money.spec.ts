import { farmerCost, feeFor, unitAmounts, workerNet } from './money';

describe('fees', () => {
  it('takes 2% on each side of a 4 500 FCFA day', () => {
    const u = unitAmounts(4500, 200, 200);
    expect(u).toEqual({ grossXof: 4500, farmerFeeXof: 90, workerFeeXof: 90 });
    expect(farmerCost(u)).toBe(4590);
    expect(workerNet(u)).toBe(4410);
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
