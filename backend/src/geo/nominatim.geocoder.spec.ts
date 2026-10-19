import { NominatimGeocoder, toPlace } from './nominatim.geocoder';

const etampes = {
  lat: '48.4347', lon: '2.1615', name: 'Étampes',
  display_name: 'Étampes, Essonne, Île-de-France, France métropolitaine, 91150, France',
  address: { town: 'Étampes', county: 'Essonne', state: 'Île-de-France', country: 'France', country_code: 'fr' },
};
const village = {
  lat: '6.9012', lon: '-6.4123',
  display_name: 'Gonaté, Daloa, Haut-Sassandra, Côte d’Ivoire',
  address: { village: 'Gonaté', city: 'Daloa', state: 'Haut-Sassandra', country_code: 'ci' },
};

function fakeFetch(body: unknown) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('toPlace', () => {
  it('uses the town name as locality', () => {
    expect(toPlace(etampes)).toMatchObject({ locality: 'Étampes', region: 'Île-de-France', countryCode: 'fr', lat: 48.4347, lng: 2.1615 });
  });

  it('prefers the village over the nearby city', () => {
    expect(toPlace(village)?.locality).toBe('Gonaté');
  });

  it('rejects results without coordinates', () => {
    expect(toPlace({ lat: 'x', lon: '1', display_name: 'nowhere' })).toBeNull();
  });
});

describe('NominatimGeocoder', () => {
  it('searches with French labels and the configured countries', async () => {
    const f = fakeFetch([village]);
    const g = new NominatimGeocoder('https://geo.test', 'Nogoman/test', ['ci'], f.fn);
    const results = await g.search('Gonaté');
    expect(results).toHaveLength(1);
    expect(f.calls[0]).toContain('countrycodes=ci');
    expect(f.calls[0]).toContain('accept-language=fr');
  });

  it('returns null when nothing is at the position', async () => {
    const g = new NominatimGeocoder('https://geo.test', 'Nogoman/test', [], fakeFetch({ error: 'Unable to geocode' }).fn);
    expect(await g.reverse(0, 0)).toBeNull();
  });

  it('caches identical requests', async () => {
    const f = fakeFetch(etampes);
    const g = new NominatimGeocoder('https://geo.test', 'Nogoman/test', [], f.fn);
    await g.reverse(48.4347, 2.1615);
    await g.reverse(48.4347, 2.1615);
    expect(f.calls).toHaveLength(1);
  });

  it('survives network failures', async () => {
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const g = new NominatimGeocoder('https://geo.test', 'Nogoman/test', [], failing);
    expect(await g.search('Daloa')).toEqual([]);
  });
});
