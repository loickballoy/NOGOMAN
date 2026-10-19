import { Logger } from '@nestjs/common';
import { Geocoder, Place } from './geocoder';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
  error?: string;
}

// From most to least specific. Rural Côte d'Ivoire is mostly villages and hamlets.
const LOCALITY_KEYS = ['village', 'hamlet', 'town', 'city', 'municipality', 'suburb', 'locality', 'county'];
const MIN_INTERVAL_MS = 1100; // Nominatim's public policy: at most one request per second.
const CACHE_TTL_MS = 24 * 3600 * 1000;
const CACHE_MAX = 2000;

export function toPlace(r: NominatimResult): Place | null {
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = r.address ?? {};
  const locality = LOCALITY_KEYS.map((k) => a[k]).find(Boolean) ?? r.name ?? r.display_name.split(',')[0].trim();
  return {
    label: r.display_name,
    locality,
    region: a.state ?? a.region ?? null,
    countryCode: a.country_code?.toLowerCase() ?? null,
    lat,
    lng,
  };
}

/**
 * OpenStreetMap's geocoder. Free, no key, worldwide, decent coverage of Ivorian villages.
 * Requests are serialised and cached to respect the public server's usage policy; point
 * NOMINATIM_URL at a self-hosted instance if traffic grows.
 */
export class NominatimGeocoder implements Geocoder {
  private readonly logger = new Logger('Nominatim');
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly countries: string[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string): Promise<Place[]> {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '6', 'accept-language': 'fr' });
    if (this.countries.length) params.set('countrycodes', this.countries.join(','));
    const rows = await this.get<NominatimResult[]>(`/search?${params}`);
    return (Array.isArray(rows) ? rows : []).map(toPlace).filter((p): p is Place => p !== null);
  }

  async reverse(lat: number, lng: number): Promise<Place | null> {
    const params = new URLSearchParams({
      lat: lat.toFixed(5), lon: lng.toFixed(5), format: 'jsonv2', addressdetails: '1', zoom: '16', 'accept-language': 'fr',
    });
    const row = await this.get<NominatimResult>(`/reverse?${params}`);
    if (!row || row.error) return null;
    return toPlace(row);
  }

  private get<T>(path: string): Promise<T | null> {
    const hit = this.cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value as T);

    const run = async (): Promise<T | null> => {
      const wait = this.last + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          this.logger.warn(`HTTP ${res.status} for ${path}`);
          return null;
        }
        const value = (await res.json()) as T;
        if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(path, { at: Date.now(), value });
        return value;
      } catch (err) {
        this.logger.warn(`request failed for ${path}: ${String(err)}`);
        return null;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
