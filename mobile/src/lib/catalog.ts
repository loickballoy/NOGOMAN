import { IconName } from '@/components/Icon';
import { JobCategory, Operator } from './types';

export const CATEGORIES: { id: JobCategory; label: string; icon: IconName }[] = [
  { id: 'HARVEST', label: 'Récolte', icon: 'basket' },
  { id: 'PLANTING', label: 'Plantation', icon: 'sprout' },
  { id: 'WEEDING', label: 'Désherbage', icon: 'leaf' },
  { id: 'CLEARING', label: 'Défrichage', icon: 'axe' },
  { id: 'TREATMENT', label: 'Traitement', icon: 'drop' },
  { id: 'TRANSPORT', label: 'Transport', icon: 'truck' },
];

export const CROPS = ['Cacao', 'Hévéa', 'Café', 'Igname', 'Palmier', 'Anacarde', 'Maraîchage', 'Riz', 'Manioc'];

export function category(id: JobCategory) {
  return CATEGORIES.find((c) => c.id === id) ?? { id, label: 'Autre', icon: 'more' as IconName };
}

/** "Récolte de cacao", "Désherbage hévéa"... built from the two taps, nothing to type. */
export function jobTitle(cat: JobCategory, crop?: string | null) {
  const label = category(cat).label;
  if (!crop) return label;
  const c = crop.toLowerCase();
  return /^[aeiouhéè]/.test(c) ? `${label} d'${c}` : `${label} de ${c}`;
}

// Brand colours stand in for the official logos until the payment provider supplies them.
export const OPERATORS: { id: Operator; name: string; short: string; bg: string; fg: string }[] = [
  { id: 'ORANGE_MONEY', name: 'Orange Money', short: 'OM', bg: '#FF7900', fg: '#111312' },
  { id: 'MTN_MOMO', name: 'MTN MoMo', short: 'MTN', bg: '#FFCC00', fg: '#111312' },
  { id: 'MOOV_MONEY', name: 'Moov Money', short: 'MV', bg: '#0B4EA2', fg: '#FFFFFF' },
  { id: 'WAVE', name: 'Wave', short: 'W', bg: '#1DC8F2', fg: '#111312' },
];

export function operator(id: Operator) {
  return OPERATORS.find((o) => o.id === id)!;
}

/** Towns used as map centres when GPS is refused, and to name a GPS position. */
export const TOWNS = [
  { name: 'Daloa', lat: 6.8774, lng: -6.4502 },
  { name: 'Soubré', lat: 5.7853, lng: -6.6083 },
  { name: 'San-Pédro', lat: 4.7485, lng: -6.6363 },
  { name: 'Bouaké', lat: 7.6906, lng: -5.0303 },
  { name: 'Yamoussoukro', lat: 6.8276, lng: -5.2893 },
  { name: 'Abidjan', lat: 5.3484, lng: -4.0083 },
];

