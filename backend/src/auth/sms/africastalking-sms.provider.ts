import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { SmsProvider } from './sms.provider';

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger('AfricasTalking');

  constructor(private readonly config: AppConfig) {}

  async send(to: string, text: string): Promise<void> {
    const { username, apiKey, senderId, sandbox } = this.config.africasTalking;
    const host = sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const body = new URLSearchParams({ username, to, message: text });
    if (senderId) body.set('from', senderId);

    const res = await fetch(`${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`SMS request failed: ${String(err)}`);
      return undefined;
    });

    const data: any = res ? await res.json().catch(() => undefined) : undefined;
    const status = data?.SMSMessageData?.Recipients?.[0]?.status;
    if (!res?.ok || status !== 'Success') {
      this.logger.error(`SMS not accepted (http ${res?.status}, status ${status})`);
      throw new ServiceUnavailableException({ code: 'SMS_FAILED', message: "Le SMS n'a pas pu être envoyé. Réessayez." });
    }
  }
}
