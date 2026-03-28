export type UserRole = 'farmer' | 'worker'

export interface User {
  id: string
  phone: string
  name: string
  role: UserRole
  rating: number
  reviewCount: number
  bio?: string
  lat: number
  lng: number
  createdAt: string
}

export interface Job {
  id: string
  farmerId: string
  farmerName: string
  farmerRating: number
  farmerReviewCount: number
  title: string
  description: string
  hectares: number
  pricePerDay: number
  currency: string
  lat: number
  lng: number
  city: string
  country: string
  startDate: string
  duration: number // days
  workersNeeded: number
  status: 'open' | 'filled' | 'completed'
  createdAt: string
}

export interface Review {
  id: string
  fromId: string
  fromName: string
  toId: string
  jobId: string
  rating: number
  comment: string
  createdAt: string
}

// Seed data — zones autour de Kinshasa, Brazzaville, Douala
export const MOCK_JOBS: Job[] = [
  {
    id: 'j1',
    farmerId: 'u2',
    farmerName: 'Kouassi Amani',
    farmerRating: 4.8,
    farmerReviewCount: 23,
    title: 'Récolte de cacao — Grande plantation',
    description: 'Besoin de travailleurs expérimentés pour la récolte principale de cacao. Hébergement sur place disponible. Repas fournis deux fois par jour.',
    hectares: 15,
    pricePerDay: 4500,
    currency: 'XOF',
    lat: 5.348,
    lng: -4.012,
    city: 'Abidjan',
    country: 'Côte d\'Ivoire',
    startDate: '2026-04-10',
    duration: 14,
    workersNeeded: 8,
    status: 'open',
    createdAt: '2026-03-20',
  },
  {
    id: 'j2',
    farmerId: 'u3',
    farmerName: 'Yao Kouamé',
    farmerRating: 4.5,
    farmerReviewCount: 11,
    title: 'Plantation d\'ignames — Saison urgente',
    description: 'Saison des pluies imminente. Recherche travailleurs pour mise en terre des ignames sur 6 hectares. Bonus productivité en fin de mission.',
    hectares: 6,
    pricePerDay: 3800,
    currency: 'XOF',
    lat: 7.691,
    lng: -5.031,
    city: 'Bouaké',
    country: 'Côte d\'Ivoire',
    startDate: '2026-04-03',
    duration: 7,
    workersNeeded: 4,
    status: 'open',
    createdAt: '2026-03-22',
  },
  {
    id: 'j3',
    farmerId: 'u4',
    farmerName: 'N\'Goran Brou',
    farmerRating: 4.9,
    farmerReviewCount: 37,
    title: 'Entretien plantation de caféiers',
    description: 'Taille, désherbage et traitement phytosanitaire sur plantation de café certifiée. Expérience café ou cacao bienvenue.',
    hectares: 10,
    pricePerDay: 4000,
    currency: 'XOF',
    lat: 6.819,
    lng: -5.274,
    city: 'Yamoussoukro',
    country: 'Côte d\'Ivoire',
    startDate: '2026-04-15',
    duration: 21,
    workersNeeded: 6,
    status: 'open',
    createdAt: '2026-03-18',
  },
  {
    id: 'j4',
    farmerId: 'u5',
    farmerName: 'Adjoua Koffi',
    farmerRating: 4.2,
    farmerReviewCount: 8,
    title: 'Maraîchage périurbain — Légumes frais',
    description: 'Petit maraîchage en périphérie de San-Pédro. Production tomates, aubergines, piment. Travail régulier possible sur plusieurs mois.',
    hectares: 2,
    pricePerDay: 3000,
    currency: 'XOF',
    lat: 4.748,
    lng: -6.636,
    city: 'San-Pédro',
    country: 'Côte d\'Ivoire',
    startDate: '2026-04-05',
    duration: 30,
    workersNeeded: 2,
    status: 'open',
    createdAt: '2026-03-25',
  },
  {
    id: 'j5',
    farmerId: 'u6',
    farmerName: 'Sékou Diabaté',
    farmerRating: 3.9,
    farmerReviewCount: 5,
    title: 'Défrichage et préparation — Palmeraie',
    description: 'Débroussaillage et préparation du sol pour nouvelle palmeraie. Machettes et outils fournis sur place.',
    hectares: 8,
    pricePerDay: 4200,
    currency: 'XOF',
    lat: 7.549,
    lng: -7.554,
    city: 'Man',
    country: 'Côte d\'Ivoire',
    startDate: '2026-04-08',
    duration: 10,
    workersNeeded: 5,
    status: 'open',
    createdAt: '2026-03-26',
  },
]

export const MOCK_REVIEWS: Review[] = [
  {
    id: 'r1', fromId: 'demo', fromName: 'Vous',
    toId: 'u2', jobId: 'j1', rating: 5,
    comment: 'Excellent agriculteur, très sérieux et paiement rapide.',
    createdAt: '2026-03-10',
  },
  {
    id: 'r2', fromId: 'u2', fromName: 'Moise Kabila',
    toId: 'demo', jobId: 'j1', rating: 4,
    comment: 'Bon travailleur, ponctuel. Je recommande.',
    createdAt: '2026-03-10',
  },
]
