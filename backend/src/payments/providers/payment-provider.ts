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

export type WebhookEvent =
  | { eventId: string; kind: 'collection'; providerRef: string; status: 'SUCCEEDED' | 'FAILED'; reason?: string }
  | { eventId: string; kind: 'payout'; providerRef: string; status: 'SUCCEEDED' | 'FAILED'; reason?: string };

/**
 * A licensed aggregator (CinetPay, PayDunya, Flutterwave…) that holds the escrowed funds,
 * collects from farmers and pays workers. Nogoman's ledger tracks who is owed what.
 */
export interface PaymentProvider {
  readonly name: string;
  createCollection(req: CollectionRequest): Promise<CollectionResult>;
  createPayout(req: PayoutRequest): Promise<PayoutResult>;
  /** Verifies the signature and normalises the payload. Throws if the signature is invalid. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): WebhookEvent;
}
