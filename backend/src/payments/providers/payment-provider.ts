import { MobileMoneyOperator } from '@prisma/client';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CollectionRequest {
  paymentId: string;
  amountXof: number;
  operator?: MobileMoneyOperator;
  phone?: string;
  description: string;
}

export interface CollectionResult {
  providerRef: string;
  /** Hosted page for card / Wave payments, if the provider uses one. */
  checkoutUrl?: string;
}

export interface PayoutRequest {
  payoutId: string;
  amountXof: number;
  operator: MobileMoneyOperator;
  phone: string;
}

export interface PayoutResult {
  providerRef: string;
}

/**
 * Thrown by `createPayout` only when the provider explicitly refused the transfer (nothing moved).
 * Any other error (timeout, network, 5xx) is ambiguous: the transfer may have gone through, so the
 * payout stays PENDING and must never be paid again. `payoutId` is the idempotency key.
 */
export class PayoutRejectedError extends Error {
  constructor(message = 'payout rejected by the provider') {
    super(message);
    this.name = 'PayoutRejectedError';
  }
}

interface WebhookEventBase {
  /** The provider's unique id for this event: a second delivery with the same id is ignored. */
  eventId: string;
  providerRef: string;
  status: 'SUCCEEDED' | 'FAILED';
  reason?: string;
  /** What the provider says actually moved. Real providers must always set it. */
  amountXof?: number;
  /**
   * When the provider emitted the event. Adapters MUST take it from a value covered by the
   * webhook signature (e.g. a signed timestamp header), never from an unsigned header or field:
   * otherwise a captured webhook could be replayed with a fresh date. PaymentsService rejects the
   * event with WEBHOOK_EXPIRED when it is more than 5 minutes old or more than 1 minute ahead.
   */
  occurredAt: Date;
}

export type WebhookEvent =
  | (WebhookEventBase & { kind: 'collection' })
  | (WebhookEventBase & { kind: 'payout' });

/**
 * A licensed aggregator (CinetPay, PayDunya, Flutterwave…) that holds the escrowed funds,
 * collects from farmers and pays workers. Nogoman's ledger tracks who is owed what.
 */
export interface PaymentProvider {
  readonly name: string;
  createCollection(req: CollectionRequest): Promise<CollectionResult>;
  createPayout(req: PayoutRequest): Promise<PayoutResult>;
  /**
   * Verifies the signature and normalises the payload, including the signed `occurredAt`.
   * Throws BAD_SIGNATURE when the signature or its signed timestamp is missing or invalid.
   */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): WebhookEvent;
}
