// Shapes returned by the Nogoman API (backend/src/**/presenter.ts).
export type Role = 'WORKER' | 'FARMER' | 'ADMIN';
export type Operator = 'ORANGE_MONEY' | 'MTN_MOMO' | 'MOOV_MONEY' | 'WAVE';
export type PayMode = 'DAILY' | 'TASK';
export type JobCategory = 'HARVEST' | 'PLANTING' | 'WEEDING' | 'CLEARING' | 'TREATMENT' | 'TRANSPORT' | 'OTHER';
export type JobStatus = 'OPEN' | 'FILLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type UnitStatus = 'PENDING' | 'RELEASED' | 'DISPUTED' | 'MISSED' | 'CANCELLED' | 'REFUNDED';

export interface PublicUser {
  id: string;
  name: string | null;
  role: Role | null;
  locality: string | null;
  verified: boolean;
  rating: { average: number | null; count: number };
  memberSince: string;
}

export interface SelfUser extends PublicUser {
  phone: string;
  bio: string | null;
  lat: number | null;
  lng: number | null;
  kycLevel: number;
  kycStatus: string;
  payout: { operator: Operator; phone: string } | null;
  profileComplete: boolean;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  category: JobCategory;
  crop: string | null;
  payMode: PayMode;
  rateXof: number;
  workerNetXof: number;
  workerTotalNetXof: number;
  workersNeeded: number;
  slotsLeft: number;
  durationDays: number;
  startDate: string;
  locality: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  status: JobStatus;
  farmer: PublicUser;
  createdAt: string;
}

export interface JobApplication {
  id: string;
  status: 'PENDING' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  message: string | null;
  createdAt: string;
  worker: PublicUser;
}

export interface MyApplication {
  id: string;
  status: JobApplication['status'];
  createdAt: string;
  job: Pick<Job, 'id' | 'title' | 'locality' | 'rateXof' | 'payMode' | 'startDate' | 'status'>;
  engagement: { id: string; status: EngagementStatus } | null;
}

export type EngagementStatus = 'AWAITING_FUNDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface WorkUnit {
  id: string;
  index: number;
  workDate: string;
  status: UnitStatus;
  amountXof: number;
  checkedInAt: string | null;
  completedAt: string | null;
  autoReleaseAt: string | null;
  releasedAt: string | null;
  disputeReason: string | null;
}

export interface Engagement {
  id: string;
  status: EngagementStatus;
  payMode: PayMode;
  rateXof: number;
  job: { id: string; title: string; locality: string; lat: number; lng: number };
  farmer: PublicUser;
  worker: PublicUser;
  totals:
    | { earnedXof: number; upcomingXof: number }
    | { heldXof: number; releasedXof: number; refundedXof: number };
  units: WorkUnit[];
}

export interface FundingQuote {
  jobId: string;
  workers: number;
  unitsPerWorker: number;
  rateXof: number;
  subtotalXof: number;
  feeXof: number;
  feeBps: number;
  totalXof: number;
}

export interface Payment {
  id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amountXof: number;
  checkoutUrl: string | null;
}

export interface PayoutHistory {
  balanceXof: number;
  payouts: { id: string; amountXof: number; operator: Operator; status: 'PENDING' | 'SUCCEEDED' | 'FAILED'; createdAt: string }[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
