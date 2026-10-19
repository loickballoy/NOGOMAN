/**
 * Issue #18: payouts go out once a day at PAYOUT_HOUR_UTC (default 18), through a job named
 * `payouts` in the @nestjs/schedule SchedulerRegistry, and only for balances of at least
 * MIN_PAYOUT_XOF (default 2 000).
 *
 * The database is shared with the other e2e files: a payout pass may also pay their users, so
 * every assertion is about the users created here.
 */
import { SchedulerRegistry } from '@nestjs/schedule';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

const phone = phones('018');

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

// Fees at 0 and a low rate floor, so that a task of N FCFA leaves exactly N on the worker's balance.
const EXACT = { FARMER_FEE_BPS: '0', WORKER_FEE_BPS: '0', MIN_DAILY_RATE_XOF: '100' };

/** "0701800001" -> "+2250701800001", the form ADMIN_PHONES expects. */
const e164 = (local: string) => `+225${local}`;

interface MyPayouts {
  balanceXof: number;
  payouts: { id: string; amountXof: number; status: string }[];
}

const payoutsOf = async (t: TestApp, user: TestUser): Promise<MyPayouts> =>
  (await t.http().get('/me/payouts').set(auth(user.token)).expect(200)).body;

/**
 * cron's fireOnTick() does not wait for an async callback unless the job was created with
 * waitForCompletion: poll until every user has been paid, then leave time for a duplicate.
 */
async function waitUntilPaid(t: TestApp, users: TestUser[], timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const states = await Promise.all(users.map((u) => payoutsOf(t, u)));
    if (states.every((s) => s.payouts.length > 0)) break;
    if (Date.now() > deadline) throw new Error('waitUntilPaid(): no payout within the timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 1000));
}

describe('daily payouts at PAYOUT_HOUR_UTC (#18)', () => {
  const apps: TestApp[] = [];
  const boot = async (...args: Parameters<typeof bootApp>) => {
    const t = await bootApp(...args);
    apps.push(t);
    return t;
  };

  afterAll(async () => {
    await Promise.all(apps.map((t) => t.close()));
  });

  const payoutsJob = (t: TestApp) => t.app.get(SchedulerRegistry).getCronJob('payouts');

  it('schedules the `payouts` job at 18:00 UTC by default, then 24 h later', async () => {
    const t = await boot({ CRON_ENABLED: 'true' }, { phones: phone });
    const job = payoutsJob(t);

    const next = job.nextDate().toJSDate();
    expect(next.toISOString().slice(11)).toBe('18:00:00.000Z');
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(DAY_MS);

    const [first, second] = job.nextDates(2).map((d) => d.toJSDate().getTime());
    expect(first).toBe(next.getTime());
    expect(second - first).toBe(DAY_MS);
  });

  it('schedules the `payouts` job at 06:00 UTC with PAYOUT_HOUR_UTC=6', async () => {
    const t = await boot({ CRON_ENABLED: 'true', PAYOUT_HOUR_UTC: '6' }, { phones: phone });
    const job = payoutsJob(t);

    const next = job.nextDate().toJSDate();
    expect(next.toISOString().slice(11)).toBe('06:00:00.000Z');
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(DAY_MS);
    const [first, second] = job.nextDates(2).map((d) => d.toJSDate().getTime());
    expect(second - first).toBe(DAY_MS);
  });

  it('refuses to start with PAYOUT_HOUR_UTC=24', async () => {
    const outcome = await bootApp({ PAYOUT_HOUR_UTC: '24' }, { phones: phone }).then(
      (t) => {
        apps.push(t);
        return 'started';
      },
      (err: Error) => err,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/PAYOUT_HOUR_UTC/);
  });

  it('pays every eligible balance when the job fires: one transfer per user, of the whole balance', async () => {
    const t = await boot({ ...EXACT, CRON_ENABLED: 'true' }, { phones: phone });
    const { farmer, worker } = await t.farmerAndWorker();
    const other = await t.worker();

    // Two tasks for the same worker: a single transfer of the sum.
    await t.paidTask(farmer, worker, 3000);
    await t.paidTask(farmer, worker, 2500);
    await t.paidTask(farmer, other, 4000);
    expect((await payoutsOf(t, worker)).balanceXof).toBe(5500);
    expect((await payoutsOf(t, other)).balanceXof).toBe(4000);

    await payoutsJob(t).fireOnTick();
    await waitUntilPaid(t, [worker, other]);

    const mine = await payoutsOf(t, worker);
    expect(mine.payouts).toHaveLength(1);
    expect(mine.payouts[0].amountXof).toBe(5500);
    expect(mine.balanceXof).toBe(0);

    const theirs = await payoutsOf(t, other);
    expect(theirs.payouts).toHaveLength(1);
    expect(theirs.payouts[0].amountXof).toBe(4000);
    expect(theirs.balanceXof).toBe(0);
  });

  it('keeps a balance of 1 999 FCFA and pays one of 2 000 FCFA (default MIN_PAYOUT_XOF)', async () => {
    const adminPhone = phone();
    const t = await boot({ ...EXACT, ADMIN_PHONES: e164(adminPhone) }, { phones: phone });
    const admin = await t.login(adminPhone);
    const farmer = await t.farmer();
    const below = await t.worker();
    const at = await t.worker();

    await t.paidTask(farmer, below, 1999);
    await t.paidTask(farmer, at, 2000);
    expect((await payoutsOf(t, below)).balanceXof).toBe(1999);
    expect((await payoutsOf(t, at)).balanceXof).toBe(2000);

    // No cf-connecting-ip header: admin routes only answer over the private network.
    await t.http().post('/admin/payouts/run').set(auth(admin.token)).expect(201);

    const kept = await payoutsOf(t, below);
    expect(kept.payouts).toHaveLength(0);
    expect(kept.balanceXof).toBe(1999);

    const paid = await payoutsOf(t, at);
    expect(paid.payouts).toHaveLength(1);
    expect(paid.payouts[0].amountXof).toBe(2000);
    expect(paid.balanceXof).toBe(0);
  });

  it('pays each user once when two instances fire at the same time', async () => {
    const [a, b] = await Promise.all([
      boot({ ...EXACT, CRON_ENABLED: 'true' }, { phones: phone }),
      boot({ ...EXACT, CRON_ENABLED: 'true' }, { phones: phone }),
    ]);
    const { farmer, worker } = await a.farmerAndWorker();
    const other = await b.worker();
    await a.paidTask(farmer, worker, 3000);
    await b.paidTask(farmer, other, 2500);

    await Promise.all([payoutsJob(a).fireOnTick(), payoutsJob(b).fireOnTick()]);
    await waitUntilPaid(a, [worker, other]);

    for (const [user, amount] of [[worker, 3000], [other, 2500]] as const) {
      const state = await payoutsOf(a, user);
      expect(state.payouts).toHaveLength(1);
      expect(state.payouts[0].amountXof).toBe(amount);
      expect(state.balanceXof).toBe(0);
    }
  });
});
