import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { SmsProvider } from './sms.provider';

const API = 'https://api.orange.com';

/**
 * Orange Developer "SMS Côte d'Ivoire": reaches Orange, MTN and Moov numbers, paid by
 * prepaid bundles bought on developer.orange.com. OAuth client credentials, token valid 1 h.
 */
@Injectable()
export class OrangeSmsProvider implements SmsProvider {
  private readonly logger = new Logger('OrangeSms');
  private token?: { value: string; expiresAt: number };

  constructor(private readonly config: AppConfig) {}

  async send(to: string, text: string): Promise<void> {
    const { senderAddress, senderName } = this.config.orange;
    const body = {
      outboundSMSMessageRequest: {
        address: `tel:${to}`,
        senderAddress,
        ...(senderName ? { senderName } : {}),
        outboundSMSTextMessage: { message: text },
      },
    };
    let res = await this.post(senderAddress, body);
    // A token revoked early (rotated credentials) gets one fresh attempt.
    if (res?.status === 401) {
      this.token = undefined;
      res = await this.post(senderAddress, body);
    }
    if (!res?.ok) {
      const detail = res ? await res.text().catch(() => '') : 'no response';
      this.logger.error(`SMS not accepted (http ${res?.status}): ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException({ code: 'SMS_FAILED', message: "Le SMS n'a pas pu être envoyé. Réessayez." });
    }
  }

  private async post(senderAddress: string, body: unknown) {
    const token = await this.accessToken();
    return fetch(`${API}/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`SMS request failed: ${String(err)}`);
      return undefined;
    });
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const { clientId, clientSecret } = this.config.orange;
    const res = await fetch(`${API}/oauth/v3/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
    const data: any = res?.ok ? await res.json().catch(() => undefined) : undefined;
    if (!data?.access_token) {
      this.logger.error(`Orange token request failed (http ${res?.status})`);
      throw new ServiceUnavailableException({ code: 'SMS_FAILED', message: "Le SMS n'a pas pu être envoyé. Réessayez." });
    }
    this.token = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }
}
