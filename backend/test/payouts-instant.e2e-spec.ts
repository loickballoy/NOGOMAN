/**
 * Issue #21 — instant payout, POST /me/payouts/instant.
 *
 * A user withdraws their whole balance without waiting for the daily run, as soon as it reaches
 * INSTANT_PAYOUT_MIN_XOF (default 10 000). It is free: no fee, no new kind of money movement
 * (same PAYOUT / PAYOUT_REVERSAL entries as the batch). It respects the emergency switch
 * (PAYOUTS_ENABLED, #19), the safety delay after a payout number change (#20) and the payout
 * already in flight.
 *
 * Fees are set to 0 so that a task at N FCFA leaves exactly N on the worker's balance.
 * Every assertion is relative to the users created here: the database is shared.
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import { addDays, isoDate, todayLocal } from '../src/common/time';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

const phone = phones('021');
// The admin who reads the trial balance: a fictitious number of this file.
const adminPhone = phone();
const ADMIN_PHONES = `+225${adminPhone}`;

/** Exact balances: no commission, and a floor low enough for every amount used here. */
const BASE_ENV = {
  FARMER_FEE_BPS: '0',
  WORKER_FEE_BPS: '0',
  MIN_DAILY_RATE_XOF: '100',
  ADMIN_PHONES,
};

type Res = request.Response;

/** Business error contract of the epic (#3): `{ code, message }`, message in plain French. */
function expectError(res: Res, status: number, code: string) {
  expect({ status: res.status, code: res.body?.code }).toEqual({ status, code });
  const message = res.body.message;
  expect(typeof message).toBe('string');
  expect(message.trim().length).toBeGreaterThan(0);
  expect(message).not.toContain('_');
  expect(message).not.toBe(code);
  // Readable French words, not a technical identifier.
  expect(message).toMatch(/[a-zàâçéèêëîïôûùüÿœ]{2,}\s+[a-zàâçéèêëîïôûùüÿœ]{2,}/i);
}

describe('Instant payout POST /me/payouts/instant (#21)', () => {
  const apps: TestApp[] = [];
  let t: TestApp;
  let admin: TestUser;

  const boot = async (env: Record<string, string> = {}) => {
    const app = await bootApp({ ...BASE_ENV, ...env }, { phones: phone });
    apps.push(app);
    return app;
  };

  const balanceOf = async (user: TestUser, on: TestApp = t): Promise<number> => {
    const res = await on.http().get('/me/payouts').set(auth(user.token)).expect(200);
    return res.body.balanceXof;
  };

  const payoutsOf = async (user: TestUser, on: TestApp = t) => {
    const res = await on.http().get('/me/payouts').set(auth(user.token)).expect(200);
    return res.body.payouts as { id: string; amountXof: number; status: string }[];
  };

  const instant = (user: TestUser, on: TestApp = t) =>
    on.http().post('/me/payouts/instant').set(auth(user.token)).send({});

  const trialBalance = async () => {
    const res = await t.http().get('/admin/ledger/trial-balance').set(auth(admin.token)).expect(200);
    return res.body as { total: number; byType: Record<string, number> };
  };

  /** A fresh worker (payout number set) whose balance holds exactly `amountXof`. */
  const workerWithBalance = async (amountXof: number, on: TestApp = t) => {
    const { farmer, worker } = await on.farmerAndWorker();
    const before = await balanceOf(worker, on);
    await on.paidTask(farmer, worker, amountXof);
    expect((await balanceOf(worker, on)) - before).toBe(amountXof);
    return worker;
  };

  /** Sends the mock provider's signed payout webhook, as the provider would. */
  const payoutWebhook = (on: TestApp, body: string) =>
    on.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set(on.app.get(MockPaymentProvider).signedHeaders(body)).send(body);

  beforeAll(async () => {
    t = await boot();
    admin = await t.login(adminPhone);
  });

  afterEach(async () => {
    // The books stay balanced after every scenario.
    expect((await trialBalance()).total).toBe(0);
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
  });

  it('refuses a balance of 9 999 FCFA under the default threshold: 400 INSTANT_PAYOUT_TOO_LOW', async () => {
    const worker = await workerWithBalance(9_999);

    const res = await instant(worker);
    expectError(res, 400, 'INSTANT_PAYOUT_TOO_LOW');

    expect(await balanceOf(worker)).toBe(9_999);
    expect(await payoutsOf(worker)).toEqual([]);
  });

  it('pays 10 000 FCFA at once, for free, without returning the full number; a second call is 409 PAYOUT_IN_PROGRESS', async () => {
    const worker = await workerWithBalance(10_000);
    const revenueBefore = (await trialBalance()).byType.PLATFORM_REVENUE ?? 0;

    const res = await instant(worker);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      amountXof: 10_000,
      status: 'PENDING',
      operator: 'ORANGE_MONEY',
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('+225');
    expect(raw).not.toContain(worker.phone);

    expect(await balanceOf(worker)).toBe(0);
    const listed = await payoutsOf(worker);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: res.body.id, amountXof: 10_000, status: 'PENDING' });

    // Free: the platform earns nothing on an instant payout.
    const revenueAfter = (await trialBalance()).byType.PLATFORM_REVENUE ?? 0;
    expect(revenueAfter - revenueBefore).toBe(0);

    const again = await instant(worker);
    expectError(again, 409, 'PAYOUT_IN_PROGRESS');
    expect(await balanceOf(worker)).toBe(0);
    expect(await payoutsOf(worker)).toHaveLength(1);
  });

  it('puts the balance back when the provider reports a failure, once only even if the webhook is replayed', async () => {
    const worker = await workerWithBalance(10_000);
    const res = await instant(worker);
    expect(res.status).toBe(201);
    expect(await balanceOf(worker)).toBe(0);

    // The provider's reference is not part of the API (and must not be): read it to sign the webhook.
    const { providerRef } = await t.app.get(PrismaService).payout.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(providerRef).toEqual(expect.any(String));
    const body = JSON.stringify({
      eventId: `e2e_${randomUUID()}`, kind: 'payout', providerRef, status: 'FAILED', reason: 'number_blocked', amountXof: 10_000,
    });

    await payoutWebhook(t, body).expect(200);
    expect(await balanceOf(worker)).toBe(10_000);
    expect((await payoutsOf(worker))[0]).toMatchObject({ id: res.body.id, status: 'FAILED' });

    // Same event delivered again: no second credit.
    await payoutWebhook(t, body).expect(200);
    expect(await balanceOf(worker)).toBe(10_000);

    // Another FAILED event for the same payout: no second credit either.
    await t.http().post(`/dev/payments/payout/${res.body.id}/simulate`).send({ status: 'FAILED', reason: 'number_blocked' }).expect(200);
    expect(await balanceOf(worker)).toBe(10_000);
  });

  it('asks for a payout number first: 400 PAYOUT_METHOD_REQUIRED', async () => {
    // A farmer has no payout number; a refunded job leaves 10 000 FCFA on their balance.
    const farmer = await t.farmer();
    const before = await balanceOf(farmer);
    const job = await t.postJob(farmer, {
      payMode: 'DAILY', rateXof: 5_000, durationDays: 2, startDate: isoDate(addDays(todayLocal(), 1)),
    });
    const { engagementId } = await t.hiredOn(job);
    await t.fundAndSettle(job);
    await t.http().post(`/engagements/${engagementId}/cancel`).set(auth(farmer.token)).expect(201);
    expect((await balanceOf(farmer)) - before).toBe(10_000);
    const me = await t.http().get('/me').set(auth(farmer.token)).expect(200);
    expect(me.body.payout ?? null).toBeNull();

    const res = await instant(farmer);
    expectError(res, 400, 'PAYOUT_METHOD_REQUIRED');
    expect((await balanceOf(farmer)) - before).toBe(10_000);
    expect(await payoutsOf(farmer)).toEqual([]);
  });

  it('waits for the safety delay after a payout operator change: 409 PAYOUT_COOLDOWN', async () => {
    const worker = await workerWithBalance(10_000);
    // Replacing an existing payout method starts the delay (#20).
    await t.http().patch('/me').set(auth(worker.token)).send({ payoutOperator: 'MTN_MOMO' }).expect(200);

    const res = await instant(worker);
    expectError(res, 409, 'PAYOUT_COOLDOWN');
    expect(await balanceOf(worker)).toBe(10_000);
    expect(await payoutsOf(worker)).toEqual([]);
  });

  it('refuses everything while payouts are switched off: 503 PAYOUTS_SUSPENDED, balance untouched', async () => {
    const off = await boot({ PAYOUTS_ENABLED: 'false' });
    const worker = await workerWithBalance(10_000, off);

    const res = await instant(worker, off);
    expectError(res, 503, 'PAYOUTS_SUSPENDED');
    expect(await balanceOf(worker, off)).toBe(10_000);
    expect(await payoutsOf(worker, off)).toEqual([]);
  });

  it('follows INSTANT_PAYOUT_MIN_XOF: with 5 000, a balance of 5 000 is paid and 4 999 is not', async () => {
    const low = await boot({ INSTANT_PAYOUT_MIN_XOF: '5000' });

    const enough = await workerWithBalance(5_000, low);
    const res = await instant(enough, low);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountXof: 5_000, status: 'PENDING' });
    expect(await balanceOf(enough, low)).toBe(0);

    const short = await workerWithBalance(4_999, low);
    expectError(await instant(short, low), 400, 'INSTANT_PAYOUT_TOO_LOW');
    expect(await balanceOf(short, low)).toBe(4_999);
  });
});
