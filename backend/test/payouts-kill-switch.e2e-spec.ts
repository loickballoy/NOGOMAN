/**
 * Issue #19 — emergency stop: PAYOUTS_ENABLED=false suspends every payout without losing or
 * changing any balance, and payouts already sent to the provider keep being settled.
 *
 * Every assertion is relative to the users created here (their payouts, their ledger balance):
 * the database is shared with the other e2e files.
 * Not covered here: the `payouts` job (fireOnTick, #18) and POST /me/payouts/instant (#21).
 */
import { randomUUID } from 'crypto';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

const phone = phones('019');
const adminPhone = phone();
const adminE164 = `+225${adminPhone}`;

// No fees, so every balance is exactly the sum of the task rates.
const BASE_ENV = { FARMER_FEE_BPS: '0', WORKER_FEE_BPS: '0', ADMIN_PHONES: adminE164 };
const ON = { ...BASE_ENV, PAYOUTS_ENABLED: 'true' };
const OFF = { ...BASE_ENV, PAYOUTS_ENABLED: 'false' };

interface Payouts {
  balanceXof: number;
  payouts: { id: string; amountXof: number; status: string; createdAt: string }[];
}

describe('emergency stop of payouts (PAYOUTS_ENABLED)', () => {
  const apps: TestApp[] = [];
  const boot = async (env: Record<string, string>) => {
    const t = await bootApp(env, { phones: phone });
    apps.push(t);
    return t;
  };
  /** Shuts an instance down, as before a restart with another configuration. */
  const stop = async (t: TestApp) => {
    apps.splice(apps.indexOf(t), 1);
    await t.close();
  };

  afterAll(async () => {
    await Promise.all(apps.map((t) => t.close()));
  });

  const payoutsOf = async (t: TestApp, user: TestUser): Promise<Payouts> =>
    (await t.http().get('/me/payouts').set(auth(user.token)).expect(200)).body;

  const runPayouts = (t: TestApp, admin: TestUser) =>
    t.http().post('/admin/payouts/run').set(auth(admin.token)).expect(201);

  const expectBalancedLedger = async (t: TestApp, admin: TestUser) => {
    const trial = await t.http().get('/admin/ledger/trial-balance').set(auth(admin.token)).expect(200);
    expect(trial.body.total).toBe(0);
  };

  /** Sends the provider's signed webhook for a payout, the way the real aggregator would. */
  const payoutWebhook = async (t: TestApp, payoutId: string, status: 'SUCCEEDED' | 'FAILED', eventId = `e2e_${randomUUID()}`) => {
    const payout = await t.app.get(PrismaService).payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(payout.providerRef).toBeTruthy();
    const body = JSON.stringify({
      eventId, kind: 'payout', providerRef: payout.providerRef, status, reason: 'number_blocked', amountXof: payout.amountXof,
    });
    await t.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-signature', t.app.get(MockPaymentProvider).sign(body)).send(body).expect(200);
    return eventId;
  };

  let admin: TestUser;
  let farmer: TestUser;
  // Two workers with a balance while payouts are off; w1 earned it in two tasks.
  let w1: TestUser;
  let w2: TestUser;
  let w1Balance: number;
  let w2Balance: number;

  it('pays nobody while PAYOUTS_ENABLED=false and leaves every balance untouched', async () => {
    const off = await boot(OFF);
    admin = await off.login(adminPhone);
    farmer = await off.farmer();
    w1 = await off.worker();
    w2 = await off.worker();

    const a = await off.paidTask(farmer, w1, 3000);
    const b = await off.paidTask(farmer, w1, 4500);
    const c = await off.paidTask(farmer, w2, 6000);
    expect([a.netXof, b.netXof, c.netXof]).toEqual([3000, 4500, 6000]);

    const before1 = await payoutsOf(off, w1);
    const before2 = await payoutsOf(off, w2);
    expect(before1).toEqual({ balanceXof: 7500, payouts: [] });
    expect(before2).toEqual({ balanceXof: 6000, payouts: [] });

    await runPayouts(off, admin);
    await runPayouts(off, admin);

    const after1 = await payoutsOf(off, w1);
    const after2 = await payoutsOf(off, w2);
    expect(after1.payouts).toEqual([]);
    expect(after2.payouts).toEqual([]);
    // To the franc.
    expect(after1.balanceXof).toBe(before1.balanceXof);
    expect(after2.balanceXof).toBe(before2.balanceXof);
    await expectBalancedLedger(off, admin);

    w1Balance = after1.balanceXof;
    w2Balance = after2.balanceXof;
    await stop(off);
  });

  it('pays each user once, for the whole balance, after a restart with PAYOUTS_ENABLED=true', async () => {
    const on = await boot(ON);
    // Nothing was paid during the stop.
    expect((await payoutsOf(on, w1)).payouts).toEqual([]);
    expect((await payoutsOf(on, w2)).payouts).toEqual([]);

    await runPayouts(on, admin);
    await runPayouts(on, admin); // a second run must not pay twice

    const after1 = await payoutsOf(on, w1);
    const after2 = await payoutsOf(on, w2);
    expect(after1.payouts).toHaveLength(1);
    expect(after1.payouts[0]).toMatchObject({ amountXof: w1Balance, status: 'PENDING' });
    expect(after1.balanceXof).toBe(0);
    expect(after2.payouts).toHaveLength(1);
    expect(after2.payouts[0]).toMatchObject({ amountXof: w2Balance, status: 'PENDING' });
    expect(after2.balanceXof).toBe(0);
    await expectBalancedLedger(on, admin);

    // Settle them so these users leave nothing in flight.
    await payoutWebhook(on, after1.payouts[0].id, 'SUCCEEDED');
    await payoutWebhook(on, after2.payouts[0].id, 'SUCCEEDED');
    expect((await payoutsOf(on, w1)).payouts[0].status).toBe('SUCCEEDED');
  });

  it('still settles a payout sent before the stop: a FAILED webhook puts the money back', async () => {
    const on = await boot(ON);
    const w3 = await on.worker();
    const task = await on.paidTask(farmer, w3, 5000);
    expect(task.netXof).toBe(5000);

    // The payout leaves before the stop and is still pending at the provider.
    await runPayouts(on, admin);
    const sent = await payoutsOf(on, w3);
    expect(sent.payouts).toHaveLength(1);
    expect(sent.payouts[0]).toMatchObject({ amountXof: 5000, status: 'PENDING' });
    expect(sent.balanceXof).toBe(0);
    await stop(on);

    // Stop, then the provider reports the failure.
    const off = await boot(OFF);
    const eventId = await payoutWebhook(off, sent.payouts[0].id, 'FAILED');

    const failed = await payoutsOf(off, w3);
    expect(failed.payouts).toHaveLength(1);
    expect(failed.payouts[0]).toMatchObject({ id: sent.payouts[0].id, status: 'FAILED' });
    expect(failed.balanceXof).toBe(5000);

    // The same webhook again credits nothing more (rule 6).
    await payoutWebhook(off, sent.payouts[0].id, 'FAILED', eventId);
    expect((await payoutsOf(off, w3)).balanceXof).toBe(5000);

    // And the stop still holds: the money stays on the balance, no new payout.
    await runPayouts(off, admin);
    const held = await payoutsOf(off, w3);
    expect(held.payouts).toHaveLength(1);
    expect(held.balanceXof).toBe(5000);
    await expectBalancedLedger(off, admin);
  });
});
