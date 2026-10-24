/**
 * Issue #87: a payout is only reversed when the provider explicitly rejects it. An ambiguous
 * error (timeout, or our own failure to store providerRef after the provider accepted) leaves it
 * PENDING, so the worker is never paid twice.
 */
import { PayoutRejectedError } from '../src/payments/providers/payment-provider';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

const phone = phones('087');

describe('Payout with an ambiguous provider outcome (#87)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootApp({ FARMER_FEE_BPS: '0', WORKER_FEE_BPS: '0', MIN_DAILY_RATE_XOF: '100' }, { phones: phone });
  });
  afterAll(() => t.close());
  afterEach(() => jest.restoreAllMocks());

  const funded = async () => {
    const { farmer, worker } = await t.farmerAndWorker();
    await t.paidTask(farmer, worker, 10_000);
    return worker;
  };
  const me = async (w: TestUser) => (await t.http().get('/me/payouts').set(auth(w.token)).expect(200)).body;

  it('keeps the payout PENDING and the balance debited when the provider call times out', async () => {
    const worker = await funded();
    jest.spyOn(t.app.get(MockPaymentProvider), 'createPayout').mockRejectedValueOnce(new Error('timeout'));
    await t.http().post('/me/payouts/instant').set(auth(worker.token)).send({}).expect(201);
    const state = await me(worker);
    expect(state.balanceXof).toBe(0);
    expect(state.payouts).toHaveLength(1);
    expect(state.payouts[0].status).toBe('PENDING');
    // No second transfer can start meanwhile.
    expect((await t.http().post('/me/payouts/instant').set(auth(worker.token)).send({})).body.code)
      .toBe('PAYOUT_IN_PROGRESS');
  });

  it('keeps the payout PENDING when storing providerRef fails after the provider accepted', async () => {
    const worker = await funded();
    const prisma = t.app.get(PrismaService);
    jest.spyOn(prisma.payout, 'update').mockImplementation((() => Promise.reject(new Error('db down'))) as never);
    await t.http().post('/me/payouts/instant').set(auth(worker.token)).send({}).expect(201);
    jest.restoreAllMocks();
    const state = await me(worker);
    expect(state.balanceXof).toBe(0);
    expect(state.payouts[0].status).toBe('PENDING');
  });

  it('gives the money back on an explicit rejection', async () => {
    const worker = await funded();
    jest.spyOn(t.app.get(MockPaymentProvider), 'createPayout').mockRejectedValueOnce(new PayoutRejectedError());
    await t.http().post('/me/payouts/instant').set(auth(worker.token)).send({}).expect(201);
    const state = await me(worker);
    expect(state.balanceXof).toBe(10_000);
    expect(state.payouts[0].status).toBe('FAILED');
  });
});
