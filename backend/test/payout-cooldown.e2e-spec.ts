/**
 * Issue #20 — safety delay after a payout method change (PAYOUT_COOLDOWN_HOURS, default 72).
 *
 * Replacing an existing payout number or operator holds the user's payouts for
 * PAYOUT_COOLDOWN_HOURS (PAYOUT_HOLD_HOURS is still read as the old name, with lower priority).
 * Registering the first number, or re-sending the same one, is free.
 *
 * Every e2e file shares the database: only this file's users are asserted on.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, login, phones, TestApp, TestUser } from './helpers';

const phone = phones('020');
const HOUR = 3600 * 1000;
const e164 = (local: string) => `+225${local.replace(/\D/g, '')}`;

// This file's own admin, so it does not share the OTP quota of flow.e2e-spec.ts's admin.
const ADMIN_PHONE = phone();
const ADMIN_ENV = { ADMIN_PHONES: e164(ADMIN_PHONE) };

describe('payout cooldown after a payout method change (#20)', () => {
  const apps: TestApp[] = [];
  const saved: Record<string, string | undefined> = {};
  let t: TestApp; // default configuration: neither PAYOUT_COOLDOWN_HOURS nor PAYOUT_HOLD_HOURS
  let prisma: PrismaService;
  let admin: TestUser;

  const boot = async (env: Record<string, string> = {}) => {
    const app = await bootApp({ ...ADMIN_ENV, ...env }, { phones: phone });
    apps.push(app);
    return app;
  };

  beforeAll(async () => {
    for (const key of ['PAYOUT_COOLDOWN_HOURS', 'PAYOUT_HOLD_HOURS']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    t = await boot();
    prisma = t.app.get(PrismaService);
    admin = await login(t, ADMIN_PHONE);
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  /** Runs the payout batch as an admin (no cf-connecting-ip: admin routes refuse it). */
  const runPayouts = (app: TestApp = t) =>
    app.http().post('/admin/payouts/run').set(auth(admin.token)).expect(201);

  /** This user's payouts only, never global totals. */
  const payoutsOf = (user: TestUser) =>
    prisma.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });

  const holdUntil = async (user: TestUser) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).payoutHoldUntil;

  /** A worker (first payout number registered by the helper) with a paid task on their balance. */
  const workerWithBalance = async (app: TestApp = t) => {
    const { farmer, worker } = await app.farmerAndWorker();
    await app.paidTask(farmer, worker, 10_000);
    return worker;
  };

  /** PATCH /me with the payout fields, and the time window around the call. */
  const changePayout = async (app: TestApp, user: TestUser, fields: Record<string, string>) => {
    const before = Date.now();
    const res = await app.http().patch('/me').set(auth(user.token)).send(fields).expect(200);
    return { res, before, after: Date.now() };
  };

  /** Asserts `date` ≈ the call time + `hours` (the call window, plus one second of slack). */
  const expectAbout = (date: Date | string | null | undefined, w: { before: number; after: number }, hours: number) => {
    expect(date).toBeTruthy();
    const at = new Date(date!).getTime();
    expect(at).toBeGreaterThanOrEqual(w.before + hours * HOUR - 1000);
    expect(at).toBeLessThanOrEqual(w.after + hours * HOUR + 1000);
  };

  it('defaults to 72 h: an operator change sets payoutHoldUntil to about now + 72 h, shown in GET /me', async () => {
    const worker = await t.worker();
    const w = await changePayout(t, worker, { payoutOperator: 'MTN_MOMO' });

    expectAbout(await holdUntil(worker), w, 72);
    expectAbout(w.res.body.payout?.heldUntil, w, 72);
    const me = await t.http().get('/me').set(auth(worker.token)).expect(200);
    expectAbout(me.body.payout?.heldUntil, w, 72);
  });

  it('blocks POST /admin/payouts/run during the hold, even one minute before its end, then pays', async () => {
    const worker = await workerWithBalance();
    await changePayout(t, worker, { payoutOperator: 'MTN_MOMO' });

    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(0);

    await prisma.$executeRaw`UPDATE "User" SET "payoutHoldUntil" = now() + interval '1 minute' WHERE "id" = ${worker.id}`;
    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(0);

    await prisma.$executeRaw`UPDATE "User" SET "payoutHoldUntil" = now() - interval '1 minute' WHERE "id" = ${worker.id}`;
    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(1);
  });

  it('still blocks 71 h after the change, and pays 73 h after it', async () => {
    const worker = await workerWithBalance();
    await changePayout(t, worker, { payoutOperator: 'MTN_MOMO' });

    // Move the change 71 h into the past: the hold, set at change time, moves with it.
    await prisma.$executeRaw`UPDATE "User" SET "payoutHoldUntil" = "payoutHoldUntil" - interval '71 hours' WHERE "id" = ${worker.id}`;
    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(0);

    // 2 h more: 73 h after the change.
    await prisma.$executeRaw`UPDATE "User" SET "payoutHoldUntil" = "payoutHoldUntil" - interval '2 hours' WHERE "id" = ${worker.id}`;
    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(1);
  });

  it('blocks payouts when only the number changes', async () => {
    const worker = await workerWithBalance();
    const { res } = await changePayout(t, worker, { payoutPhone: phone() });
    expect(res.body.payout?.heldUntil).toBeTruthy();

    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(0);
  });

  it('does not hold the first payout number registered', async () => {
    const worker = await workerWithBalance(); // t.worker() registered its first payout number
    expect(await holdUntil(worker)).toBeNull();
    const me = await t.http().get('/me').set(auth(worker.token)).expect(200);
    expect(me.body.payout).toMatchObject({ operator: 'ORANGE_MONEY', heldUntil: null });

    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(1);
  });

  it('does not hold when the same payout method is sent again', async () => {
    const worker = await workerWithBalance();
    const { res } = await changePayout(t, worker, { payoutOperator: 'ORANGE_MONEY', payoutPhone: worker.phone });
    expect(res.body.payout?.heldUntil).toBeNull();
    expect(await holdUntil(worker)).toBeNull();

    await runPayouts();
    expect(await payoutsOf(worker)).toHaveLength(1);
  });

  it('reads PAYOUT_COOLDOWN_HOURS', async () => {
    const app = await boot({ PAYOUT_COOLDOWN_HOURS: '1' });
    const worker = await app.worker();
    const w = await changePayout(app, worker, { payoutOperator: 'MTN_MOMO' });
    expectAbout(await holdUntil(worker), w, 1);
  });

  it('still accepts PAYOUT_HOLD_HOURS alone, as the old name', async () => {
    const app = await boot({ PAYOUT_HOLD_HOURS: '5' });
    const worker = await app.worker();
    const w = await changePayout(app, worker, { payoutOperator: 'MTN_MOMO' });
    expectAbout(await holdUntil(worker), w, 5);
  });

  it('prefers PAYOUT_COOLDOWN_HOURS when both are set', async () => {
    const app = await boot({ PAYOUT_COOLDOWN_HOURS: '2', PAYOUT_HOLD_HOURS: '5' });
    const worker = await app.worker();
    const w = await changePayout(app, worker, { payoutOperator: 'MTN_MOMO' });
    expectAbout(await holdUntil(worker), w, 2);
  });

  it('warns the owner by SMS that payouts resume in 72 h', async () => {
    const worker = await t.worker();
    await changePayout(t, worker, { payoutOperator: 'MTN_MOMO' });
    const text = t.sms.lastTo(e164(worker.phone));
    expect(text).toContain('numéro de paiement a été modifié');
    expect(text).toMatch(/\b72\s?h\b/);
  });

  it('sends the payout to the new number once the hold is over', async () => {
    const worker = await workerWithBalance();
    const newNumber = phone();
    await changePayout(t, worker, { payoutOperator: 'MTN_MOMO', payoutPhone: newNumber });

    await prisma.$executeRaw`UPDATE "User" SET "payoutHoldUntil" = now() - interval '1 minute' WHERE "id" = ${worker.id}`;
    await runPayouts();
    const payouts = await payoutsOf(worker);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ operator: 'MTN_MOMO', phone: e164(newNumber) });
    expect(payouts[0].phone).not.toBe(e164(worker.phone));
  });
});
