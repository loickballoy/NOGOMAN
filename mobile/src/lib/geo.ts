import { api } from './api';
import { Place } from './types';

export const searchPlaces = (q: string) => api<Place[]>(`/geo/search?q=${encodeURIComponent(q)}`);

export const reversePlace = (lat: number, lng: number) =>
  api<Place>(`/geo/reverse?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);

/** "Rue X, Étampes, Essonne, Île-de-France, 91150, France" -> "Étampes, Essonne". */
export function shortLabel(p: Place): string {
  const parts = p.label.split(',').map((s) => s.trim()).filter(Boolean);
  const i = parts.indexOf(p.locality);
  const tail = i >= 0 ? parts.slice(i, i + 2) : parts.slice(0, 2);
  return tail.join(', ');
}
