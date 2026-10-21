import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { ConsoleSmsProvider } from '../src/auth/sms/console-sms.provider';
import { configureApp } from '../src/bootstrap';
import { isoDate, todayLocal } from '../src/common/time';
import { GEOCODER, Geocoder, Place } from '../src/geo/geocoder';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';

/**
 * Issue #14 — rule 9: every error the API sends has a stable English `code` and a plain
 * French `message` the app can read aloud. Black box: only HTTP status codes and bodies.
 */

// Daloa, a point ~300 m away and one ~10 km away.
const FARM = { lat: 6.8774, lng: -6.4502 };
const NEAR = { lat: 6.8795, lng: -6.4502 };
const FAR = { lat: 6.9674, lng: -6.4502 };

// Reverse-geocoding this position makes the (fake) geocoder crash, to provoke a 500.
const CRASH = { lat: 4.2424, lng: -7.4242 };
// Internal details the crash carries; none of them may reach the client.
const SECRET = 'SECRET_INTERNE_14 postgresql://nogoman:motdepasse@10.0.0.7:5432/prod';

// Fictitious numbers, distinct from the ones flow.e2e-spec.ts uses.
const PHONES = {
  farmer: '07 08 14 14 01',
  otherFarmer: '07 08 14 14 02',
  worker: '05 44 14 14 03',
  flooder: '07 08 14 14 04',
};

// English words Nest/class-validator put in their default messages.
const ENGLISH = /\b(not found|unauthorized|forbidden|internal|server|error|too many|requests?|must|should|property|exception|cannot|bad request)\b/i;

/** The body every error must have: { statusCode, code, message } with a French, speakable message. */
function expectApiError(res: Response, status: number, code?: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual(expect.objectContaining({ statusCode: status }));
  expect(typeof res.body.code).toBe('string');
  expect(res.body.code).toMatch(/^[A-Z_]+$/);
  if (code) expect(res.body.code).toBe(code);
  expectSpeakableFrench(res.body.message);
}

function expectSpeakableFrench(message: unknown) {
  expect(typeof message).toBe('string');
  const text = message as string;
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text).not.toContain('_'); // never a code read aloud
  expect(text).not.toMatch(ENGLISH);
}

describe('Uniform error format { code, message } (issue #14)', () => {
  let app: INestApplication;
  let sms: ConsoleSmsProvider;
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string) {
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const normalized = `+225${phone.replace(/\D/g, '')}`;
    const code = sms.lastTo(normalized)!.match(/(\d{6})/)![1];
    const res = await http().post('/auth/otp/verify').send({ phone, code }).expect(200);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  const daloa: Place = { label: 'Gonaté, Daloa, Haut-Sassandra, Côte d’Ivoire', locality: 'Daloa', region: 'Haut-Sassandra', countryCode: 'ci', lat: FARM.lat, lng: FARM.lng };
  // A provider that fails like a real dependency would (database down, network...), so the 500
  // comes from the real exception path, without any test-only route in the application.
  const crashingGeocoder: Geocoder = {
    search: async (q) => (q.toLowerCase().includes('daloa') ? [daloa] : []),
    reverse: async (lat, lng) => {
      if (lat === CRASH.lat && lng === CRASH.lng) throw new Error(`connect ECONNREFUSED ${SECRET}`);
      return { ...daloa, lat, lng };
    },
  };

  let farmer: { token: string; id: string };
  let otherFarmer: { token: string; id: string };
  let worker: { token: string; id: string };
  let jobId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODER).useValue(crashingGeocoder)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    sms = app.get(ConsoleSmsProvider);

    farmer = await login(PHONES.farmer);
    await http().patch('/me').set(auth(farmer.token)).send({ name: 'Yao Kouadio', role: 'FARMER' }).expect(200);
    otherFarmer = await login(PHONES.otherFarmer);
    await http().patch('/me').set(auth(otherFarmer.token)).send({ name: 'Adjoua Brou', role: 'FARMER' }).expect(200);
    worker = await login(PHONES.worker);
    await http().patch('/me').set(auth(worker.token))
      .send({ name: 'Ibrahim Traoré', role: 'WORKER', locality: 'Daloa', ...NEAR }).expect(200);

    // A task (not daily) job: its unit has no auto-release time until the worker marks it done,
    // so WorkService.autoRelease in flow.e2e-spec.ts (same database) never picks it up.
    const job = await http().post('/jobs').set(auth(farmer.token)).send({
      title: 'Désherbage café', category: 'WEEDING', crop: 'Café', payMode: 'TASK',
      rateXof: 20000, workersNeeded: 1, durationDays: 2, startDate: isoDate(todayLocal()),
      locality: 'Daloa', ...FARM,
    }).expect(201);
    jobId = job.body.id;
  });

  afterAll(async () => {
    // Never leave an open job behind: flow.e2e-spec.ts searches jobs across the whole country.
    // Refused (and harmless) once the job is funded, as it is then FILLED.
    await http().post(`/jobs/${jobId}/cancel`).set(auth(farmer.token));
    await app.close();
  });

  describe('404 — NOT_FOUND', () => {
    it('answers an unknown job with NOT_FOUND and a French message', async () => {
      const res = await http().get('/jobs/offre-qui-n-existe-pas').set(auth(worker.token));
      expectApiError(res, 404, 'NOT_FOUND');
    });

    it('answers an unknown route the same way', async () => {
      const res = await http().get('/route-qui-n-existe-pas').set(auth(worker.token));
      expectApiError(res, 404, 'NOT_FOUND');
    });

    it('answers a webhook for an unknown provider the same way', async () => {
      const res = await http().post('/webhooks/payments/inconnu').set('Content-Type', 'application/json').send('{}');
      expectApiError(res, 404, 'NOT_FOUND');
    });
  });

  describe('403 — forbidden', () => {
    it('refuses a route of another role with a code and a French message', async () => {
      const res = await http().post('/jobs').set(auth(worker.token)).send({});
      // WRONG_ROLE is an existing business code: it stays as it is.
      expectApiError(res, 403, 'WRONG_ROLE');
    });

    it('answers FORBIDDEN when a farmer touches another farmer’s job', async () => {
      const res = await http().patch(`/jobs/${jobId}`).set(auth(otherFarmer.token)).send({ title: 'Pas mon offre' });
      expectApiError(res, 403, 'FORBIDDEN');
    });
  });

  describe('401 — UNAUTHORIZED', () => {
    it('answers a request without a token', async () => {
      const res = await http().get('/me');
      expectApiError(res, 401, 'UNAUTHORIZED');
    });

    it('answers a request with a forged token', async () => {
      const res = await http().get('/me').set(auth('pas.un.jeton'));
      expectApiError(res, 401, 'UNAUTHORIZED');
    });

    it('answers an unknown refresh token', async () => {
      const res = await http().post('/auth/refresh').send({ refreshToken: 'x'.repeat(40) });
      expectApiError(res, 401, 'UNAUTHORIZED');
    });
  });

  describe('400 — VALIDATION_FAILED', () => {
    it('turns body validation errors into a French message, with the technical details apart', async () => {
      const res = await http().post('/jobs').set(auth(farmer.token)).send({ title: 'x', rateXof: 'beaucoup', champInconnu: 1 });
      expectApiError(res, 400, 'VALIDATION_FAILED');
      expect(res.body.details).toBeDefined();
    });

    it('does the same for query parameters', async () => {
      const res = await http().get('/jobs').query({ lat: 'nord', lng: -6.45 }).set(auth(worker.token));
      expectApiError(res, 400, 'VALIDATION_FAILED');
      expect(res.body.details).toBeDefined();
    });

    it('never answers a malformed JSON body without a code and a message', async () => {
      const res = await http().post('/auth/otp/request').set('Content-Type', 'application/json').send('{"phone": ');
      expectApiError(res, 400);
    });
  });

  describe('500 — INTERNAL_ERROR', () => {
    it('answers an unexpected failure with INTERNAL_ERROR and leaks no internal detail', async () => {
      const res = await http().get('/geo/reverse').query(CRASH).set(auth(farmer.token));
      expectApiError(res, 500, 'INTERNAL_ERROR');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('SECRET_INTERNE_14');
      expect(raw).not.toContain('ECONNREFUSED');
      expect(raw).not.toContain('postgresql://');
      expect(raw).not.toMatch(/stack|\.ts:\d+/);
    });
  });

  describe('429 — TOO_MANY_REQUESTS', () => {
    it('answers the per-IP rate limit with TOO_MANY_REQUESTS and a French message', async () => {
      // /geo/search allows 30 calls a minute per IP.
      let res: Response | undefined;
      for (let i = 0; i < 40; i++) {
        res = await http().get('/geo/search').query({ q: 'Daloa' }).set(auth(worker.token));
        if (res.status === 429) break;
      }
      expectApiError(res!, 429, 'TOO_MANY_REQUESTS');
    });
  });

  describe('payment webhooks', () => {
    it('rejects a badly signed webhook with BAD_SIGNATURE and a French message', async () => {
      const body = JSON.stringify({ eventId: 'evt_err_1', kind: 'collection', providerRef: 'mock_col_x', status: 'SUCCEEDED' });
      const res = await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
        .set('x-mock-signature', 'f'.repeat(64)).send(body);
      expectApiError(res, 401, 'BAD_SIGNATURE');
    });

    it('rejects an unsigned webhook the same way', async () => {
      const res = await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json').send('{}');
      expectApiError(res, 401, 'BAD_SIGNATURE');
    });

    it('rejects a well signed but invalid event with BAD_PAYLOAD and a French message', async () => {
      const body = JSON.stringify({ eventId: 'evt_err_2', kind: 'remboursement', providerRef: 'mock_col_x', status: 'PEUT_ETRE' });
      const res = await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
        .set(app.get(MockPaymentProvider).signedHeaders(body)).send(body);
      expectApiError(res, 401, 'BAD_PAYLOAD');
    });
  });

  describe('existing business codes stay unchanged', () => {
    it('keeps WRONG_ROLE', async () => {
      const res = await http().post('/jobs').set(auth(worker.token)).send({}).expect(403);
      expect(res.body.code).toBe('WRONG_ROLE');
      expect(res.body.message).toBe('Action réservée à un autre type de compte');
    });

    it('keeps OTP_INVALID', async () => {
      await http().post('/auth/otp/request').send({ phone: PHONES.worker }).expect(200);
      const real = sms.lastTo(`+225${PHONES.worker.replace(/\D/g, '')}`)!.match(/(\d{6})/)![1];
      const wrong = real === '000000' ? '111111' : '000000';
      const res = await http().post('/auth/otp/verify').send({ phone: PHONES.worker, code: wrong }).expect(400);
      expect(res.body.code).toBe('OTP_INVALID');
      expect(res.body.message).toBe('Code incorrect.');
    });

    it('keeps OTP_DAILY_LIMIT (429)', async () => {
      let res: Response | undefined;
      for (let i = 0; i < 15; i++) {
        res = await http().post('/auth/otp/request').send({ phone: PHONES.flooder });
        if (res.status !== 200) break;
      }
      expect(res!.status).toBe(429);
      expect(res!.body.code).toBe('OTP_DAILY_LIMIT');
      expect(res!.body.message).toBe('Trop de codes demandés aujourd’hui. Réessayez demain.');
    });

    it('keeps PAYOUT_METHOD_REQUIRED, then TOO_FAR at check-in', async () => {
      const noPayout = await http().post(`/jobs/${jobId}/applications`).set(auth(worker.token)).send({}).expect(400);
      expect(noPayout.body.code).toBe('PAYOUT_METHOD_REQUIRED');
      expect(noPayout.body.message).toBe('Ajoutez votre numéro mobile money pour être payé.');

      await http().patch('/me').set(auth(worker.token)).send({ payoutOperator: 'MTN_MOMO', payoutPhone: PHONES.worker }).expect(200);
      const application = await http().post(`/jobs/${jobId}/applications`).set(auth(worker.token)).send({}).expect(201);
      const hired = await http().post(`/applications/${application.body.id}/hire`).set(auth(farmer.token)).expect(201);
      const pay = await http().post(`/jobs/${jobId}/funding`).set(auth(farmer.token)).send({}).expect(201);
      await http().post(`/dev/payments/collection/${pay.body.id}/simulate`).send({ status: 'SUCCEEDED' }).expect(200);
      const engagement = await http().get(`/engagements/${hired.body.id}`).set(auth(worker.token)).expect(200);

      const far = await http().post(`/work-units/${engagement.body.units[0].id}/check-in`).set(auth(worker.token)).send(FAR).expect(400);
      expect(far.body.code).toBe('TOO_FAR');
      expect(far.body.message).toMatch(/^Vous êtes à \d+\.\d km de la plantation\. Rapprochez-vous pour pointer\.$/);
    });
  });
});
