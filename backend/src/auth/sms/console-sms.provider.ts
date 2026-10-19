import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/** Development provider: logs messages and keeps them in memory (used by tests). */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');
  readonly outbox: { to: string; text: string }[] = [];

  async send(to: string, text: string): Promise<void> {
    this.outbox.push({ to, text });
    this.logger.log(`to ${to}: ${text}`);
  }

  lastTo(to: string): string | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      if (this.outbox[i].to === to) return this.outbox[i].text;
    }
    return undefined;
  }
}
