/**
 * Issue #13 (rule 6): webhooks carry a signed timestamp and are rejected when older than 5 minutes
 * or too far in the future.
 *
 * Mock webhook format assumed by these tests (to be validated by the maintainer):
 *   - header `x-mock-timestamp`: Unix time in whole SECONDS, as a decimal string (e.g. "1792440000");
 *   - header `x-mock-signature`: lowercase hex HMAC-SHA256 with MOCK_WEBHOOK_SECRET of
 *     `${timestamp}.${rawBody}` (the header value, a dot, then the raw request body).
 *
 * The signature is computed here from that contract, not with MockPaymentProvider.sign, so the
 * tests pin the wire format a real sender would use. Every assertion is relative to the job,
 * payment or event created by the test: the database is shared with the other e2e files.
 */
import { createHmac, randomUUID } from 'crypto';
import { Accounts, LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestJob } from './helpers';

const phone = phones('013');
const SECRET = 'e2e-issue-13-mock-webhook-secret';
const MINUTE = 60;

const nowSeconds = () => Date.now() / 1000;

describe('payment webhooks: signed timestamp and 5-minute freshness (issue #13)', () => {
  let t: TestApp;
  let ledger: LedgerService;
  let prisma: PrismaService;

  beforeAll(async () => {
    t = await bootApp({ MOCK_WEBHOOK_SECRET: SECRET }, { phones: phone });
    ledger = t.app.get(LedgerService);
    prisma = t.app.get(PrismaService);
  });

  afterAll(async () => {
    await t.close();
  });

  const sign = (timestamp: string, rawBody: string) =>
    createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex');

  /** Posts `rawBody` to the mock webhook route with the given timestamp header and signature. */
  const post = (rawBody: string, timestamp: string, signature = sign(timestamp, rawBody)) =>
    t.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-timestamp', timestamp).set('x-mock-signature', signature).send(rawBody);

  /** A hired job whose funding was started but not settled yet, and the webhook body that settles it. */
  async function pendingFunding() {
    const { farmer, worker } = await t.farmerAndWorker();
    const job: TestJob = await t.postJob(farmer);
    const { engagementId } = await t.hiredOn(job, worker);
    const pay = await t.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    expect(pay.body.status).toBe('PENDING');
    const eventId = `e2e13_${randomUUID()}`;
    const body = JSON.stringify({
      eventId, kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED', amountXof: pay.body.amountXof,
    });
    return { job, farmer, worker, engagementId, paymentId: pay.body.id as string, amountXof: pay.body.amountXof as number, eventId, body };
  }

  const escrowOf = (job: TestJob) => ledger.balance(Accounts.escrow(job.id).code);
  const eventsWithId = (eventId: string) => prisma.webhookEvent.count({ where: { provider: 'mock', eventId } });
  const paymentStatus = async (f: Awaited<ReturnType<typeof pendingFunding>>) =>
    (await t.http().get(`/payments/${f.paymentId}`).set(auth(f.farmer.token)).expect(200)).body.status;

  /** Nothing was recorded nor posted for that webhook: no WebhookEvent, empty escrow, payment still pending. */
  async function expectUntouched(f: Awaited<ReturnType<typeof pendingFunding>>) {
    expect(await eventsWithId(f.eventId)).toBe(0);
    expect(await escrowOf(f.job)).toBe(0);
    expect(await paymentStatus(f)).toBe('PENDING');
  }

  it('accepts a webhook signed 4 min 59 s ago', async () => {
    const f = await pendingFunding();
    // Rounded up: the event is at most 4 min 59 s old when it leaves the test.
    const timestamp = String(Math.ceil(nowSeconds()) - (4 * MINUTE + 59));

    const res = await post(f.body, timestamp).expect(200);
    expect(res.body).toEqual({ ok: true });

    expect(await eventsWithId(f.eventId)).toBe(1);
    expect(await escrowOf(f.job)).toBe(f.amountXof);
    expect(await paymentStatus(f)).toBe('SUCCEEDED');
  });

  it('rejects a webhook signed 5 min 01 s ago with WEBHOOK_EXPIRED, records nothing and leaves the ledger as is', async () => {
    const f = await pendingFunding();
    const timestamp = String(Math.floor(nowSeconds()) - (5 * MINUTE + 1));

    const res = await post(f.body, timestamp).expect(400);
    expect(res.body).toMatchObject({ code: 'WEBHOOK_EXPIRED' });
    expect(typeof res.body.message).toBe('string');
    await expectUntouched(f);

    // The rejected event id was not burnt: the provider's fresh retry of the same event goes through.
    await post(f.body, String(Math.floor(nowSeconds()))).expect(200);
    expect(await escrowOf(f.job)).toBe(f.amountXof);
  });

  it('rejects a timestamp changed without re-signing with 401 BAD_SIGNATURE', async () => {
    const f = await pendingFunding();
    // A webhook captured 10 minutes ago, replayed with a fresh timestamp but its original signature.
    const signedAt = String(Math.floor(nowSeconds()) - 10 * MINUTE);
    const forged = String(Math.floor(nowSeconds()));

    const res = await post(f.body, forged, sign(signedAt, f.body)).expect(401);
    expect(res.body).toMatchObject({ code: 'BAD_SIGNATURE' });
    await expectUntouched(f);

    // Control: the same body, properly signed with that fresh timestamp, is accepted.
    await post(f.body, forged).expect(200);
    expect(await escrowOf(f.job)).toBe(f.amountXof);
  });

  it('rejects a webhook dated 2 minutes in the future with WEBHOOK_EXPIRED', async () => {
    const f = await pendingFunding();
    const timestamp = String(Math.floor(nowSeconds()) + 2 * MINUTE);

    const res = await post(f.body, timestamp).expect(400);
    expect(res.body).toMatchObject({ code: 'WEBHOOK_EXPIRED' });
    expect(typeof res.body.message).toBe('string');
    await expectUntouched(f);
  });

  it('still credits only once a fresh webhook received twice (non-regression)', async () => {
    const f = await pendingFunding();
    const timestamp = String(Math.floor(nowSeconds()));
    const signature = sign(timestamp, f.body);

    const first = await post(f.body, timestamp, signature).expect(200);
    expect(first.body).toEqual({ ok: true });
    const again = await post(f.body, timestamp, signature).expect(200);
    expect(again.body.duplicate).toBe(true);

    expect(await eventsWithId(f.eventId)).toBe(1);
    expect(await escrowOf(f.job)).toBe(f.amountXof);
    expect(await paymentStatus(f)).toBe('SUCCEEDED');
    const e = await t.http().get(`/engagements/${f.engagementId}`).set(auth(f.worker.token)).expect(200);
    expect(e.body.status).toBe('ACTIVE');
  });
});
