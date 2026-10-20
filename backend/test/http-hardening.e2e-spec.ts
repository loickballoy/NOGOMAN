import { Response } from 'supertest';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

/**
 * Issue #22 — 2.1 HTTP hardening: stricter throttling on /auth/*, the right client IP behind
 * Cloudflare, Helmet, CORS limited to CORS_ORIGINS, request bodies limited to 1 MB.
 * Black box: only HTTP status codes, headers and bodies.
 *
 * Choices made for these tests (to be validated by the maintainer):
 *
 * - Trusted proxy: a new variable `TRUSTED_PROXY_IPS`, read when the app starts, lists the
 *   addresses of the reverse proxy (the cloudflared container), comma-separated IPs or CIDR
 *   ranges. Only a request whose TCP peer is in that list is identified by its
 *   `CF-Connecting-IP` header; any other request is identified by its own address, so a client
 *   can't dodge the limits by sending the header itself. Unset or empty (the default): no proxy
 *   is trusted and the header is always ignored. An IPv4-mapped address (::ffff:127.0.0.1)
 *   matches its IPv4 entry. Here the loopback plays the tunnel: `TRUSTED_PROXY_IPS=127.0.0.1,::1`.
 *   Client addresses come from the documentation ranges (RFC 5737), never real ones.
 * - The /auth/otp/request threshold is OTP_REQUESTS_PER_IP_MINUTE (already documented in
 *   .env.example). It is read per request, so its value comes from test/env.ts.
 * - Body size: 1 MB for JSON and urlencoded bodies; raw audio (Content-Type: audio/*) on
 *   POST /conversations/:id/voice keeps a 3 MB exception (comment on the issue).
 * - 413 and 429 answer the uniform error body of #14: PAYLOAD_TOO_LARGE, TOO_MANY_REQUESTS.
 */

const phone = phones('022');

// Read per request by the API (test/env.ts sets it): the per-IP limit of /auth/otp/request.
const OTP_PER_IP = Number(process.env.OTP_REQUESTS_PER_IP_MINUTE);

// Every instance of this file: the SMS kill switch (codes sent by everyone in 24 h, counted in
// the shared database) must not be what answers, only the per-IP limit under test.
const BASE = { SMS_DAILY_LIMIT: '1000000' };
const LOOPBACK_PROXY = '127.0.0.1,::1';

// Fictitious client addresses (RFC 5737 documentation ranges).
const CLIENT_A = '203.0.113.10';
const CLIENT_B = '203.0.113.20';
const clientIp = (n: number) => `198.51.100.${n}`;

const KB = 1024;
const MB = 1024 * 1024;

const ALLOWED_ORIGIN = 'https://nogoman.ci';
const OTHER_ALLOWED_ORIGIN = 'https://app.nogoman.ci';
const UNKNOWN_ORIGIN = 'https://inconnu.example';

/** The body every error must have (#14): { statusCode, code, message } with a French message. */
function expectApiError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual(expect.objectContaining({ statusCode: status, code }));
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.trim().length).toBeGreaterThan(0);
  expect(res.body.message).not.toContain('_');
}

/** Not refused for its size: accepted, or rejected by validation (the issue allows both). */
function expectNotRejectedForSize(res: Response) {
  expect(res.status).not.toBe(413);
  expect(res.body?.code).not.toBe('PAYLOAD_TOO_LARGE');
  if (res.status === 400) expect(res.body.code).toBe('VALIDATION_FAILED');
  else expect(res.status).toBe(200);
}

describe('HTTP hardening: throttler, client IP, body size, CORS, Helmet (issue #22)', () => {
  const apps: TestApp[] = [];
  const boot = async (env: Record<string, string> = {}) => {
    const t = await bootApp({ ...BASE, ...env }, { phones: phone });
    apps.push(t);
    return t;
  };

  /** One code request for a fresh fictitious number, optionally "from" a client behind the proxy. */
  const requestOtp = (t: TestApp, cfConnectingIp?: string) => {
    const req = t.http().post('/auth/otp/request');
    if (cfConnectingIp) req.set('CF-Connecting-IP', cfConnectingIp);
    return req.send({ phone: t.phone() });
  };

  /** `count` code requests in a row, each for a new number; returns their statuses. */
  async function requestOtps(t: TestApp, count: number, cfConnectingIp?: (i: number) => string) {
    const statuses: number[] = [];
    for (let i = 0; i < count; i++) statuses.push((await requestOtp(t, cfConnectingIp?.(i))).status);
    return statuses;
  }

  // One instance for everything that doesn't count code requests (fewer apps, fewer shutdown hooks).
  let shared: TestApp;

  beforeAll(async () => {
    expect(Number.isInteger(OTP_PER_IP) && OTP_PER_IP > 0).toBe(true);
    shared = await boot();
  });

  afterAll(async () => {
    await Promise.all(apps.map((t) => t.close()));
  });

  describe('Stricter limit on /auth/*', () => {
    it('answers 429 TOO_MANY_REQUESTS to the N+1th code request from one IP; another route is not limited at that threshold', async () => {
      const t = await boot();

      expect(await requestOtps(t, OTP_PER_IP)).toEqual(Array(OTP_PER_IP).fill(200));
      expectApiError(await requestOtp(t), 429, 'TOO_MANY_REQUESTS');

      // Same client, same minute: an ordinary route still answers well past that threshold.
      const health: number[] = [];
      for (let i = 0; i < OTP_PER_IP + 1; i++) health.push((await t.http().get('/health')).status);
      expect(health).toEqual(Array(OTP_PER_IP + 1).fill(200));
    });
  });

  describe('Client identification behind Cloudflare', () => {
    it('behind the trusted proxy, two different CF-Connecting-IP values have two distinct counters', async () => {
      const t = await boot({ TRUSTED_PROXY_IPS: LOOPBACK_PROXY });

      expect(await requestOtps(t, OTP_PER_IP, () => CLIENT_A)).toEqual(Array(OTP_PER_IP).fill(200));
      expectApiError(await requestOtp(t, CLIENT_A), 429, 'TOO_MANY_REQUESTS');

      // Another farmer behind the same tunnel is not blocked by the first one's counter.
      expect((await requestOtp(t, CLIENT_B)).status).toBe(200);
    });

    it('without a trusted proxy, CF-Connecting-IP is ignored: changing it does not dodge the limit', async () => {
      const t = await boot({ TRUSTED_PROXY_IPS: '' });

      expect(await requestOtps(t, OTP_PER_IP, (i) => clientIp(i + 1))).toEqual(Array(OTP_PER_IP).fill(200));
      expectApiError(await requestOtp(t, clientIp(OTP_PER_IP + 1)), 429, 'TOO_MANY_REQUESTS');
    });

    it('a request that does not come from the trusted proxy cannot pick its identity with CF-Connecting-IP', async () => {
      // The proxy is elsewhere: the loopback client talks to the API directly.
      const t = await boot({ TRUSTED_PROXY_IPS: '198.51.100.250' });

      expect(await requestOtps(t, OTP_PER_IP, (i) => clientIp(i + 1))).toEqual(Array(OTP_PER_IP).fill(200));
      expectApiError(await requestOtp(t, clientIp(OTP_PER_IP + 1)), 429, 'TOO_MANY_REQUESTS');
    });
  });

  describe('Request body size: 1 MB for JSON and urlencoded', () => {
    let t: TestApp;
    let user: TestUser;

    beforeAll(async () => {
      t = shared;
      user = await t.login();
    });

    it('rejects a 1.1 MB JSON body with 413 PAYLOAD_TOO_LARGE', async () => {
      const body = JSON.stringify({ name: 'a'.repeat(Math.ceil(1.1 * MB)) });
      const res = await t.http().patch('/me').set(auth(user.token)).set('Content-Type', 'application/json').send(body);
      expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
    });

    it('does not reject a 900 KB JSON body for its size', async () => {
      const body = JSON.stringify({ name: 'a'.repeat(900 * KB) });
      const res = await t.http().patch('/me').set(auth(user.token)).set('Content-Type', 'application/json').send(body);
      expectNotRejectedForSize(res);
    });

    it('rejects a 1.1 MB urlencoded body with 413 PAYLOAD_TOO_LARGE', async () => {
      const body = `name=${'a'.repeat(Math.ceil(1.1 * MB))}`;
      const res = await t.http().patch('/me').set(auth(user.token)).set('Content-Type', 'application/x-www-form-urlencoded').send(body);
      expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
    });

    it('does not reject a 900 KB urlencoded body for its size', async () => {
      const body = `name=${'a'.repeat(900 * KB)}`;
      const res = await t.http().patch('/me').set(auth(user.token)).set('Content-Type', 'application/x-www-form-urlencoded').send(body);
      expectNotRejectedForSize(res);
    });
  });

  describe('Request body size: 3 MB exception for voice notes (POST /conversations/:id/voice)', () => {
    let t: TestApp;
    let farmer: TestUser;
    let conversationId: string;

    beforeAll(async () => {
      t = shared;
      farmer = await t.farmer();
      const job = await t.postJob(farmer);
      const { applicationId } = await t.hiredOn(job);
      const conversation = await t.http().post(`/applications/${applicationId}/conversation`).set(auth(farmer.token)).expect(201);
      conversationId = conversation.body.id;
    });

    const sendVoice = (bytes: number) => t.http()
      .post(`/conversations/${conversationId}/voice?durationMs=5000`)
      .set(auth(farmer.token))
      .set('Content-Type', 'audio/mp4')
      .send(Buffer.alloc(bytes, 7));

    it('accepts a 2.5 MB voice note', async () => {
      const res = await sendVoice(Math.ceil(2.5 * MB));
      expect(res.status).toBe(201);
      expect(res.body).toEqual(expect.objectContaining({ kind: 'VOICE', mine: true, audioUrl: expect.any(String) }));
    });

    it('rejects a 3.1 MB voice note with 413 PAYLOAD_TOO_LARGE', async () => {
      expectApiError(await sendVoice(Math.ceil(3.1 * MB)), 413, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('CORS limited to CORS_ORIGINS', () => {
    let withList: TestApp;

    beforeAll(async () => {
      withList = await boot({ CORS_ORIGINS: `${ALLOWED_ORIGIN},${OTHER_ALLOWED_ORIGIN}` });
    });

    const preflight = (t: TestApp, origin: string) => t.http()
      .options('/auth/otp/request')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    it('answers a preflight from an allowed origin with Access-Control-Allow-Origin', async () => {
      const t = withList;
      for (const origin of [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN]) {
        const res = await preflight(t, origin);
        expect(res.status).toBeLessThan(300);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
      }
    });

    it('gives no Access-Control-Allow-Origin to an unknown origin', async () => {
      const t = withList;
      expect((await preflight(t, UNKNOWN_ORIGIN)).headers['access-control-allow-origin']).toBeUndefined();
      const res = await t.http().get('/health').set('Origin', UNKNOWN_ORIGIN).expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('accepts no origin at all when CORS_ORIGINS is empty', async () => {
      const t = await boot({ CORS_ORIGINS: '' });
      expect((await preflight(t, ALLOWED_ORIGIN)).headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Helmet', () => {
    it('sends the security headers, on success and on errors', async () => {
      const t = shared;
      const ok = await t.http().get('/health').expect(200);
      const notFound = await t.http().get('/route-inconnue-22').expect(404);
      for (const res of [ok, notFound]) {
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['referrer-policy']).toBeDefined();
        expect(res.headers['x-powered-by']).toBeUndefined();
      }
    });
  });

  describe('Payment webhooks keep their raw body', () => {
    let t: TestApp;

    beforeAll(() => {
      t = shared;
    });

    it('settles a funding with a signed webhook', async () => {
      const farmer = await t.farmer();
      const job = await t.postJob(farmer);
      await t.hiredOn(job);
      const funding = await t.fundAndSettle(job);
      const payment = await t.http().get(`/payments/${funding.paymentId}`).set(auth(farmer.token)).expect(200);
      expect(payment.body.status).toBe('SUCCEEDED');
    });

    it('checks the signature over the exact bytes received, not a re-serialised body', async () => {
      const farmer = await t.farmer();
      const job = await t.postJob(farmer);
      await t.hiredOn(job);
      const pay = await t.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);

      // Indented and with a trailing newline: JSON.stringify(req.body) would give other bytes.
      const body = `${JSON.stringify({
        eventId: `e2e_022_${pay.body.id}`, kind: 'collection', providerRef: pay.body.providerRef,
        status: 'SUCCEEDED', amountXof: pay.body.amountXof,
      }, null, 2)}\n`;
      await t.http().post('/webhooks/payments/mock')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', t.app.get(MockPaymentProvider).sign(body))
        .send(body)
        .expect(200);

      const payment = await t.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
      expect(payment.body.status).toBe('SUCCEEDED');
    });
  });
});
