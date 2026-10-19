import { maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('accepts a local Ivorian mobile number with spaces', () => {
    expect(normalizePhone('07 08 12 34 56', ['CI'])).toBe('+2250708123456');
  });

  it('accepts the international form', () => {
    expect(normalizePhone('+225 05 44 33 22 11', ['CI'])).toBe('+2250544332211');
  });

  it('rejects numbers from countries that are not open yet', () => {
    expect(() => normalizePhone('+221 77 123 45 67', ['CI'])).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => normalizePhone('1234', ['CI'])).toThrow();
  });

  it('masks for display', () => {
    expect(maskPhone('+2250708123456')).toBe('+225 07 •• •• 56');
  });
});
