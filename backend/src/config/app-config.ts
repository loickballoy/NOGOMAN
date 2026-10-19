import { Injectable } from '@nestjs/common';

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback?: string): string {
  const value = env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

function int(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function list(env: Env, key: string, fallback: string[]): string[] {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

@Injectable()
export class AppConfig {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly corsOrigins: string[];
  readonly enableDocs: boolean;
  readonly enableDevRoutes: boolean;
  readonly cronEnabled: boolean;

  readonly jwtSecret: string;
  readonly accessTokenTtlSec: number;
  readonly refreshTokenTtlDays: number;

  readonly otpSecret: string;
  readonly otpTtlSec: number;
  readonly otpMaxAttempts: number;
  readonly otpMaxPerWindow: number;
  readonly otpWindowSec: number;
  readonly allowedCountries: string[];
  readonly adminPhones: string[];

  readonly smsProvider: 'console' | 'africastalking';
  readonly africasTalking: { username: string; apiKey: string; senderId?: string; sandbox: boolean };

  readonly paymentProvider: 'mock';
  readonly mockWebhookSecret: string;

  readonly farmerFeeBps: number;
  readonly workerFeeBps: number;
  readonly autoReleaseHourUtc: number;
  readonly taskAutoReleaseHours: number;
  readonly checkInRadiusKm: number;
  readonly minPayoutXof: number;
  readonly requireKycToTransact: boolean;

  readonly geocoder: 'nominatim' | 'none';
  readonly nominatimUrl: string;
  readonly geocoderUserAgent: string;
  readonly geocodeCountries: string[];

  constructor(env: Env = process.env) {
    this.nodeEnv = env.NODE_ENV ?? 'development';
    this.isProduction = this.nodeEnv === 'production';
    this.port = int(env, 'PORT', 3000);
    this.corsOrigins = list(env, 'CORS_ORIGINS', []);
    this.enableDocs = bool(env, 'ENABLE_DOCS', !this.isProduction);
    this.enableDevRoutes = bool(env, 'ENABLE_DEV_ROUTES', false) && !this.isProduction;
    this.cronEnabled = bool(env, 'CRON_ENABLED', true);

    this.jwtSecret = str(env, 'JWT_SECRET');
    if (this.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    this.accessTokenTtlSec = int(env, 'JWT_ACCESS_TTL_SEC', 15 * 60);
    this.refreshTokenTtlDays = int(env, 'REFRESH_TTL_DAYS', 30);

    this.otpSecret = str(env, 'OTP_SECRET');
    this.otpTtlSec = int(env, 'OTP_TTL_SEC', 5 * 60);
    this.otpMaxAttempts = int(env, 'OTP_MAX_ATTEMPTS', 5);
    this.otpMaxPerWindow = int(env, 'OTP_MAX_PER_WINDOW', 3);
    this.otpWindowSec = int(env, 'OTP_WINDOW_SEC', 15 * 60);
    this.allowedCountries = list(env, 'ALLOWED_COUNTRIES', ['CI']);
    this.adminPhones = list(env, 'ADMIN_PHONES', []);

    const sms = env.SMS_PROVIDER ?? 'console';
    if (sms !== 'console' && sms !== 'africastalking') throw new Error('SMS_PROVIDER must be console or africastalking');
    if (sms === 'console' && this.isProduction) throw new Error('SMS_PROVIDER=console is not allowed in production');
    this.smsProvider = sms;
    this.africasTalking = {
      username: env.AT_USERNAME ?? '',
      apiKey: env.AT_API_KEY ?? '',
      senderId: env.AT_SENDER_ID || undefined,
      sandbox: bool(env, 'AT_SANDBOX', false),
    };
    if (sms === 'africastalking' && (!this.africasTalking.username || !this.africasTalking.apiKey)) {
      throw new Error('AT_USERNAME and AT_API_KEY are required when SMS_PROVIDER=africastalking');
    }

    const payment = env.PAYMENT_PROVIDER ?? 'mock';
    if (payment !== 'mock') throw new Error('PAYMENT_PROVIDER must be mock (real providers arrive in the payments phase)');
    this.paymentProvider = payment;
    this.mockWebhookSecret = str(env, 'MOCK_WEBHOOK_SECRET', this.isProduction ? undefined : 'dev-mock-webhook-secret');

    this.farmerFeeBps = int(env, 'FARMER_FEE_BPS', 200);
    this.workerFeeBps = int(env, 'WORKER_FEE_BPS', 200);
    for (const [key, v] of [['FARMER_FEE_BPS', this.farmerFeeBps], ['WORKER_FEE_BPS', this.workerFeeBps]] as const) {
      if (v < 0 || v > 5000) throw new Error(`${key} must be between 0 and 5000`);
    }
    this.autoReleaseHourUtc = int(env, 'AUTO_RELEASE_HOUR_UTC', 9);
    this.taskAutoReleaseHours = int(env, 'TASK_AUTO_RELEASE_HOURS', 48);
    this.checkInRadiusKm = Number(env.CHECKIN_RADIUS_KM ?? 2);
    this.minPayoutXof = int(env, 'MIN_PAYOUT_XOF', 100);
    this.requireKycToTransact = bool(env, 'REQUIRE_KYC_TO_TRANSACT', false);

    const geocoder = env.GEOCODER ?? 'nominatim';
    if (geocoder !== 'nominatim' && geocoder !== 'none') throw new Error('GEOCODER must be nominatim or none');
    this.geocoder = geocoder;
    this.nominatimUrl = (env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
    // Nominatim's policy asks for an identifying User-Agent with a way to reach you.
    this.geocoderUserAgent = `Nogoman/0.1 (${env.GEOCODER_CONTACT || 'contact not set'})`;
    this.geocodeCountries = list(env, 'GEOCODE_COUNTRIES', []).map((c) => c.toLowerCase());
  }
}
