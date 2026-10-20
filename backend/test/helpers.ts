/**
 * Shared e2e helpers: start the API with a given configuration and replay the usual steps
 * (login, hire, fund, pay a task) over HTTP, the way the phone app does.
 *
 *   const phone = phones('015');                       // one prefix per test file
 *   const t = await bootApp({ FARMER_FEE_BPS: '0' }, { phones: phone });
 *   const { farmer, worker } = await t.farmerAndWorker();
 *   const task = await t.paidTask(farmer, worker, 10_000);
 *   await t.close();
 *
 * Tests written with these helpers must assert relative state (this user's balance, this job's
 * escrow), never global totals: every e2e file shares the same database.
 */
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConsoleSmsProvider } from '../src/auth/sms/console-sms.provider';
import { configureApp } from '../src/bootstrap';
import { isoDate, todayLocal } from '../src/common/time';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';

// Daloa, and a point ~300 m away: inside the default check-in radius.
export const FARM = { lat: 6.8774, lng: -6.4502 };
export const NEAR = { lat: 6.8795, lng: -6.4502 };

export type Http = () => ReturnType<typeof request>;

export interface TestUser {
  id: string;
  /** Access token, for `auth(user.token)`. */
  token: string;
  refreshToken: string;
  /** Local number as typed, e.g. "0701500001". */
  phone: string;
  isNewUser: boolean;
}

export interface TestJob {
  id: string;
  farmer: TestUser;
  payMode: 'DAILY' | 'TASK';
  rateXof: number;
  /** The POST /jobs response. */
  body: any;
}

export interface Hire {
  worker: TestUser;
  applicationId: string;
  engagementId: string;
}

export interface Funding {
  paymentId: string;
  amountXof: number;
  /** The mock webhook's event id, unique across files and instances. */
  eventId: string;
}

export interface PaidTask {
  job: TestJob;
  engagementId: string;
  unitId: string;
  /** What the worker was credited: rate minus the worker fee frozen at funding. */
  netXof: number;
  funding: Funding;
}

export interface TestApp {
  app: INestApplication;
  http: Http;
  sms: ConsoleSmsProvider;
  /** Next fictitious number of this file (see `phones`). */
  phone: () => string;
  /** Signs up (or logs in) a fresh number through the console OTP. */
  login(phone?: string): Promise<TestUser>;
  /** A farmer with a complete profile. */
  farmer(): Promise<TestUser>;
  /** A worker with a complete profile, located near FARM, with a payout number (required to apply). */
  worker(): Promise<TestUser>;
  farmerAndWorker(): Promise<{ farmer: TestUser; worker: TestUser }>;
  /** POST /jobs as `farmer`: by default DAILY, 4 500 FCFA x 3 days, 1 worker, starting today at FARM. */
  postJob(farmer: TestUser, fields?: Record<string, unknown>): Promise<TestJob>;
  /** `worker` (a new one by default) applies and the job's farmer hires them. */
  hiredOn(job: TestJob, worker?: TestUser): Promise<Hire>;
  /** The farmer funds every hired worker of the job and a signed mock webhook settles it. */
  fundAndSettle(job: TestJob): Promise<Funding>;
  /** A TASK job, hired, funded, marked done and confirmed: the worker's balance holds the net. */
  paidTask(farmer: TestUser, worker: TestUser, rateXof: number): Promise<PaidTask>;
  close(): Promise<void>;
}

export interface BootOptions {
  /** Number generator of the test file, needed by the scenarios. */
  phones?: () => string;
  /** Replace providers before compiling, e.g. `(b) => b.overrideProvider(GEOCODER).useValue(fake)`. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const usedPrefixes = new Set<string>();

/**
 * Fictitious Ivorian mobile numbers, distinct per test file: "07" + the file's 3-digit prefix
 * + a 5-digit counter (100 000 numbers per file). Pick a prefix no other e2e file uses (e.g.
 * the issue number, "015"). Reserved: "081" and "998" (flow.e2e-spec.ts).
 */
export function phones(prefix: string): () => string {
  if (!/^\d{3}$/.test(prefix)) throw new Error(`phones(): prefix must be 3 digits, got "${prefix}"`);
  if (usedPrefixes.has(prefix)) throw new Error(`phones(): prefix ${prefix} is already used in this file`);
  usedPrefixes.add(prefix);
  let n = 0;
  return () => {
    if (++n > 99_999) throw new Error(`phones(): prefix ${prefix} is exhausted`);
    return `07${prefix}${String(n).padStart(5, '0')}`;
  };
}

/** "07 01 50 00 01" -> "+2250701500001", what the API stores and texts. */
const e164 = (phone: string) => `+225${phone.replace(/\D/g, '')}`;

const appOf = (target: INestApplication | TestApp) => ('app' in target && 'sms' in target ? target.app : target) as INestApplication;

/** Logs `phone` in through the console SMS provider of that app instance. */
export async function login(target: INestApplication | TestApp, phone: string): Promise<TestUser> {
  const app = appOf(target);
  const http = () => request(app.getHttpServer());
  await http().post('/auth/otp/request').send({ phone }).expect(200);
  const text = app.get(ConsoleSmsProvider).lastTo(e164(phone));
  const code = text?.match(/(\d{6})/)?.[1];
  if (!code) throw new Error(`login(): no OTP sent to ${phone}`);
  const res = await http().post('/auth/otp/verify').send({ phone, code }).expect(200);
  return {
    id: res.body.user.id,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    phone,
    isNewUser: res.body.isNewUser,
  };
}

// Read at request time (auth.controller.ts), not when the app starts: bootApp can't set them.
const REQUEST_TIME_ENV = ['OTP_REQUESTS_PER_IP_MINUTE', 'OTP_VERIFY_PER_IP_MINUTE'];

// AppConfig and Prisma read process.env while the app starts. Concurrent bootApp calls would
// see each other's variables, so starts are serialised; the running apps then live side by side.
let startLock: Promise<unknown> = Promise.resolve();

/**
 * Starts the API with `env` on top of test/env.ts, then restores process.env. Several instances
 * can run at once on the same database (each has its own SMS outbox and rate-limit counters).
 */
export async function bootApp(env: Record<string, string> = {}, options: BootOptions = {}): Promise<TestApp> {
  const ignored = Object.keys(env).filter((k) => REQUEST_TIME_ENV.includes(k));
  if (ignored.length) throw new Error(`bootApp(): ${ignored.join(', ')} are read per request; set them in test/env.ts`);

  const start = startLock.then(async () => {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      let builder = Test.createTestingModule({ imports: [AppModule] });
      if (options.override) builder = options.override(builder);
      const moduleRef = await builder.compile();
      const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
      configureApp(app);
      await app.init();
      return app;
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  startLock = start.catch(() => undefined);
  return wrap(await start, options);
}

function wrap(app: INestApplication, options: BootOptions): TestApp {
  const http: Http = () => request(app.getHttpServer());
  const phone = () => {
    if (!options.phones) throw new Error('bootApp(): pass { phones: phones("<prefix>") } to use the scenarios');
    return options.phones();
  };

  const t: TestApp = {
    app,
    http,
    sms: app.get(ConsoleSmsProvider),
    phone,

    login: (number = phone()) => login(app, number),

    async farmer() {
      const user = await t.login();
      await http().patch('/me').set(auth(user.token)).send({ name: 'Planteur Test', role: 'FARMER' }).expect(200);
      return user;
    },

    async worker() {
      const user = await t.login();
      await http().patch('/me').set(auth(user.token)).send({
        name: 'Ouvrier Test', role: 'WORKER', locality: 'Daloa', ...NEAR,
        payoutOperator: 'ORANGE_MONEY', payoutPhone: user.phone,
      }).expect(200);
      return user;
    },

    async farmerAndWorker() {
      return { farmer: await t.farmer(), worker: await t.worker() };
    },

    async postJob(farmer, fields = {}) {
      const res = await http().post('/jobs').set(auth(farmer.token)).send({
        title: 'Récolte de cacao', category: 'HARVEST', payMode: 'DAILY', rateXof: 4500, workersNeeded: 1,
        durationDays: 3, startDate: isoDate(todayLocal()), locality: 'Daloa', ...FARM, ...fields,
      }).expect(201);
      return { id: res.body.id, farmer, payMode: res.body.payMode, rateXof: res.body.rateXof, body: res.body };
    },

    async hiredOn(job, worker) {
      const w = worker ?? (await t.worker());
      const application = await http().post(`/jobs/${job.id}/applications`).set(auth(w.token)).send({}).expect(201);
      const hired = await http().post(`/applications/${application.body.id}/hire`).set(auth(job.farmer.token)).expect(201);
      return { worker: w, applicationId: application.body.id, engagementId: hired.body.id };
    },

    async fundAndSettle(job) {
      const pay = await http().post(`/jobs/${job.id}/funding`).set(auth(job.farmer.token)).send({}).expect(201);
      const eventId = `e2e_${randomUUID()}`;
      const body = JSON.stringify({
        eventId, kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED', amountXof: pay.body.amountXof,
      });
      await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
        .set(app.get(MockPaymentProvider).signedHeaders(body)).send(body).expect(200);
      const settled = await http().get(`/payments/${pay.body.id}`).set(auth(job.farmer.token)).expect(200);
      if (settled.body.status !== 'SUCCEEDED') throw new Error(`fundAndSettle(): payment is ${settled.body.status}`);
      return { paymentId: pay.body.id, amountXof: pay.body.amountXof, eventId };
    },

    async paidTask(farmer, worker, rateXof) {
      const job = await t.postJob(farmer, { title: 'Désherbage', category: 'WEEDING', payMode: 'TASK', rateXof, durationDays: 2 });
      const { engagementId } = await t.hiredOn(job, worker);
      const funding = await t.fundAndSettle(job);
      const e = await http().get(`/engagements/${engagementId}`).set(auth(worker.token)).expect(200);
      const unit = e.body.units[0];
      await http().post(`/work-units/${unit.id}/done`).set(auth(worker.token)).expect(201);
      const confirmed = await http().post(`/work-units/${unit.id}/confirm`).set(auth(farmer.token)).expect(201);
      if (confirmed.body.units[0].status !== 'RELEASED') throw new Error('paidTask(): the task was not released');
      return { job, engagementId, unitId: unit.id, netXof: unit.amountXof, funding };
    },

    close: () => app.close(),
  };
  return t;
}
