import { AppConfig } from './app-config';

const DEFAULT_SECRET = 'dev-mock-webhook-secret';
const JWT = 'j'.repeat(40);
const STRONG = 's'.repeat(40);

function make(extra: Record<string, string | undefined>) {
  return new AppConfig({
    JWT_SECRET: JWT,
    OTP_SECRET: JWT,
    SMS_PROVIDER: 'orange',
    ORANGE_CLIENT_ID: 'id',
    ORANGE_CLIENT_SECRET: 'secret',
    ...extra,
  });
}

describe('AppConfig MOCK_WEBHOOK_SECRET (issue #132)', () => {
  it.each(['development', 'test'])('falls back to a dev secret when NODE_ENV=%s', (nodeEnv) => {
    expect(make({ NODE_ENV: nodeEnv }).mockWebhookSecret).toBe(DEFAULT_SECRET);
  });

  it.each(['production', 'staging', 'prod', 'Production', ''])(
    'requires MOCK_WEBHOOK_SECRET when NODE_ENV=%j',
    (nodeEnv) => {
      expect(() => make({ NODE_ENV: nodeEnv })).toThrow(/MOCK_WEBHOOK_SECRET/);
    },
  );

  it('requires MOCK_WEBHOOK_SECRET when NODE_ENV is unset', () => {
    expect(() => make({ NODE_ENV: undefined })).toThrow(/MOCK_WEBHOOK_SECRET/);
  });

  it('rejects secrets shorter than 32 characters outside development/test', () => {
    expect(() => make({ NODE_ENV: 'staging', MOCK_WEBHOOK_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('rejects the public default value outside development/test', () => {
    expect(() => make({ NODE_ENV: 'staging', MOCK_WEBHOOK_SECRET: DEFAULT_SECRET.padEnd(40, 'x') })).toThrow();
    expect(() => make({ NODE_ENV: 'staging', MOCK_WEBHOOK_SECRET: ' '.repeat(40) })).toThrow(/at least 32/);
    expect(() => make({ NODE_ENV: 'staging', MOCK_WEBHOOK_SECRET: DEFAULT_SECRET })).toThrow();
  });

  it('accepts a strong explicit secret anywhere', () => {
    expect(make({ NODE_ENV: 'staging', MOCK_WEBHOOK_SECRET: STRONG }).mockWebhookSecret).toBe(STRONG);
    expect(make({ NODE_ENV: 'test', MOCK_WEBHOOK_SECRET: STRONG }).mockWebhookSecret).toBe(STRONG);
  });
});
