import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { hmacSha256, randomToken, safeEqualHex } from '../../common/crypto';
import {
  CollectionRequest, CollectionResult, PaymentProvider, PayoutRequest, PayoutResult, WebhookEvent,
} from './payment-provider';

/**
 * Stand-in for the real aggregator. It accepts every request and waits for a signed
 * webhook (sent by the dev simulate routes or by tests) to settle it, exactly like a
 * real provider would.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly config: AppConfig) {}

  async createCollection(req: CollectionRequest): Promise<CollectionResult> {
    return { providerRef: `mock_col_${req.paymentId}_${randomToken(6)}` };
  }

  async createPayout(req: PayoutRequest): Promise<PayoutResult> {
    return { providerRef: `mock_pay_${req.payoutId}_${randomToken(6)}` };
  }

  sign(rawBody: string): string {
    return hmacSha256(this.config.mockWebhookSecret, rawBody);
  }

  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): WebhookEvent {
    const signature = headers['x-mock-signature'];
    if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)
      || !safeEqualHex(signature, this.sign(rawBody.toString('utf8')))) {
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'Signature du webhook invalide.' });
    }
    const body = JSON.parse(rawBody.toString('utf8'));
    if (!['collection', 'payout'].includes(body.kind) || !['SUCCEEDED', 'FAILED'].includes(body.status)
      || typeof body.eventId !== 'string' || typeof body.providerRef !== 'string'
      || (body.amountXof !== undefined && !Number.isInteger(body.amountXof))) {
      throw new UnauthorizedException({ code: 'BAD_PAYLOAD', message: 'Contenu du webhook invalide.' });
    }
    return body as WebhookEvent;
  }
}
