import { User } from '@prisma/client';
import { maskPhone } from '../common/phone';

export function rating(user: Pick<User, 'ratingSum' | 'ratingCount'>) {
  return {
    average: user.ratingCount ? Math.round((user.ratingSum / user.ratingCount) * 10) / 10 : null,
    count: user.ratingCount,
  };
}

/** What other users may see. Never includes a phone number. */
export function presentPublic(user: User) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    locality: user.locality,
    verified: user.kycLevel >= 1,
    rating: rating(user),
    memberSince: user.createdAt,
  };
}

/** What the account owner sees about themselves. */
export function presentSelf(user: User) {
  return {
    ...presentPublic(user),
    phone: user.phone,
    bio: user.bio,
    lat: user.lat,
    lng: user.lng,
    kycLevel: user.kycLevel,
    kycStatus: user.kycStatus,
    payout: user.payoutOperator && user.payoutPhone
      ? {
        operator: user.payoutOperator,
        phone: maskPhone(user.payoutPhone),
        heldUntil: user.payoutHoldUntil && user.payoutHoldUntil > new Date() ? user.payoutHoldUntil : null,
      }
      : null,
    profileComplete: Boolean(user.name && user.role),
  };
}
