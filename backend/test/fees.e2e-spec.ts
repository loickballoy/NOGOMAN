/**
 * Issue #16 — default fees 500 / 300 bps, frozen when the farmer funds the mission (rule 3).
 *
 * A one-day DAILY mission at 4 000 FCFA costs the farmer 4 000 + 5 % = 4 200 and pays the worker
 * 4 000 - 3 % = 3 880; the platform keeps 200 + 120 = 320. A fee change after funding must never
 * change those amounts. Every file shares the database: only relative state is asserted.
 */
import { randomUUID } from 'crypto';
import { Accounts, LedgerService } from '../src/ledger/ledger.service';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { auth, bootApp, NEAR, phones, TestApp, TestJob, TestUser } from './helpers';

const phone = phones('016');

/** Fee rates of the "changed" instance, well away from the defaults. */
const RAISED = { FARMER_FEE_BPS: '1000', WORKER_FEE_BPS: '1000' };

describe('fees frozen at funding (#16)', () => {
  let a: TestApp; // defaults: no fee variable set
  let b: TestApp; // fees raised to 10 % on each side, same database

  beforeAll(async () => {
    a = await bootApp({}, { phones: phone });
    b = await bootApp(RAISED, { phones: phone });
  });

  afterAll(async () => {
    await Promise.all([a?.close(), b?.close()]);
  });

  const ledger = () => a.app.get(LedgerService);
  const balanceOf = async (t: TestApp, user: TestUser) =>
    (await t.http().get('/me/payouts').set(auth(user.token)).expect(200)).body.balanceXof as number;
  const escrowOf = (job: TestJob) => ledger().balance(Accounts.escrow(job.id).code);
  const revenue = () => ledger().balance(Accounts.revenue().code);

  /** A one-day DAILY mission at 4 000 FCFA, posted on `t`, with a worker hired. */
  async function oneDayMission(t: TestApp) {
    const { farmer, worker } = await t.farmerAndWorker();
    const job = await t.postJob(farmer, { rateXof: 4000, durationDays: 1 });
    const { engagementId } = await t.hiredOn(job, worker);
    return { farmer, worker, job, engagementId };
  }

  /** The worker checks in on today's unit and the farmer confirms it, both on `t`. */
  async function checkInAndConfirm(t: TestApp, farmer: TestUser, worker: TestUser, engagementId: string) {
    const e = await t.http().get(`/engagements/${engagementId}`).set(auth(worker.token)).expect(200);
    const unit = e.body.units[0];
    await t.http().post(`/work-units/${unit.id}/check-in`).set(auth(worker.token)).send(NEAR).expect(201);
    const confirmed = await t.http().post(`/work-units/${unit.id}/confirm`).set(auth(farmer.token)).expect(201);
    expect(confirmed.body.units[0].status).toBe('RELEASED');
  }

  it('by default, a 4 000 FCFA day costs the farmer 4 200 and pays the worker 3 880', async () => {
    const { farmer, worker, job, engagementId } = await oneDayMission(a);

    const offer = await a.http().get(`/jobs/${job.id}`).set(auth(worker.token)).expect(200);
    expect(offer.body.workerNetXof).toBe(3880);

    const quote = await a.http().get(`/jobs/${job.id}/funding/quote`).set(auth(farmer.token)).expect(200);
    expect(quote.body.totalXof).toBe(4200);

    const funding = await a.fundAndSettle(job);
    expect(funding.amountXof).toBe(4200);
    const payment = await a.http().get(`/payments/${funding.paymentId}`).set(auth(farmer.token)).expect(200);
    expect(payment.body.amountXof).toBe(4200);
    expect(await escrowOf(job)).toBe(4200);

    const workerBefore = await balanceOf(a, worker);
    const revenueBefore = await revenue();
    await checkInAndConfirm(a, farmer, worker, engagementId);

    expect((await balanceOf(a, worker)) - workerBefore).toBe(3880);
    expect((await revenue()) - revenueBefore).toBe(320);
    expect(await escrowOf(job)).toBe(0);
    expect((await ledger().trialBalance()).total).toBe(0);
  });

  it('keeps the funding fees when the rates change between payment and webhook', async () => {
    const { farmer, worker, job, engagementId } = await oneDayMission(a);

    // Funded on A, at the default rates.
    const pay = await a.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    expect(pay.body.amountXof).toBe(4200);
    const farmerBefore = await balanceOf(a, farmer);

    // The provider's webhook reaches B, which already runs with the new rates.
    const body = JSON.stringify({
      eventId: `e2e_${randomUUID()}`, kind: 'collection', providerRef: pay.body.providerRef,
      status: 'SUCCEEDED', amountXof: pay.body.amountXof,
    });
    await b.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set(b.app.get(MockPaymentProvider).signedHeaders(body)).send(body).expect(200);
    const settled = await b.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
    expect(settled.body.status).toBe('SUCCEEDED');

    // The whole payment backs the day: no surplus refunded, no debit of the farmer.
    expect(await escrowOf(job)).toBe(4200);
    expect(await balanceOf(b, farmer)).toBe(farmerBefore);

    const workerBefore = await balanceOf(b, worker);
    await checkInAndConfirm(b, farmer, worker, engagementId);
    expect((await balanceOf(b, worker)) - workerBefore).toBe(3880);
    expect(await escrowOf(job)).toBe(0);
    expect((await ledger().trialBalance()).total).toBe(0);
  });

  it('keeps the funding fees when the rates change after the webhook', async () => {
    const { farmer, worker, job, engagementId } = await oneDayMission(a);
    await a.fundAndSettle(job);
    const announced = (await a.http().get(`/engagements/${engagementId}`).set(auth(worker.token)).expect(200))
      .body.totals.upcomingXof as number;

    const workerBefore = await balanceOf(b, worker);
    await checkInAndConfirm(b, farmer, worker, engagementId);
    const credited = (await balanceOf(b, worker)) - workerBefore;

    expect(credited).toBe(announced); // what was promised at funding, whatever B's rates
    expect(credited).toBe(3880);
    expect(await escrowOf(job)).toBe(0);
  });
});
