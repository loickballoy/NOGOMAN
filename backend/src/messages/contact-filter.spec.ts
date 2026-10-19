import { filterContacts } from './contact-filter';

describe('filterContacts', () => {
  it('leaves normal messages untouched', () => {
    const msg = 'Bonjour, vous pouvez commencer lundi à 7 h ? Le prix est 4 500 FCFA par jour.';
    expect(filterContacts(msg)).toEqual({ text: msg, flags: [] });
  });

  it('keeps amounts and dates readable', () => {
    expect(filterContacts('Total 192 780 FCFA, début le 02/11/2026').flags).toEqual([]);
  });

  it.each([
    'appelle-moi au 07 08 12 34 56',
    'mon numéro: +225 0708123456',
    'c est le 07.08.12.34.56',
    'O7 O8 12 34 56 stp',
    '00225-07-08-12-34-56',
  ])('masks phone numbers: %s', (msg) => {
    const r = filterContacts(msg);
    expect(r.flags).toContain('PHONE');
    expect(r.text).not.toMatch(/\d{2}\D?\d{2}\D?\d{2}\D?\d{2}/);
    expect(r.text).toContain('•••');
  });

  it('masks numbers spelled out in French', () => {
    const r = filterContacts('note bien: zéro sept zéro huit douze trente-quatre cinquante-six merci');
    expect(r.flags).toContain('PHONE');
    expect(r.text).toBe('note bien: ••• merci');
  });

  it('does not treat a few number words as a phone number', () => {
    expect(filterContacts('il faut deux ou trois personnes pour sept jours').flags).toEqual([]);
  });

  it('masks emails, links and other messaging apps', () => {
    const r = filterContacts('écris-moi sur WhatsApp ou kouassi.amani@gmail.com ou wa.me/225070812');
    expect(r.flags).toEqual(expect.arrayContaining(['APP', 'EMAIL', 'LINK']));
    expect(r.text).not.toMatch(/whatsapp|gmail|wa\.me/i);
  });
});
