import { randomUUID } from 'crypto';
import { LedgerService } from '../src/ledger/ledger.service';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { auth, bootApp, phones, TestApp } from './helpers';

const phone = phones('086');

describe('Webhook retried after a failed application (#86)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootApp({}, { phones: phone });
  });
  afterAll(() => t.close());

  it('applies the funding when the provider replays the event after a failure', async () => {
    const { farmer } = await t.farmerAndWorker();
    const job = await t.postJob(farmer);
    await t.hiredOn(job);
    const pay = await t.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);

    const eventId = `e2e_${randomUUID()}`;
    const body = JSON.stringify({
      eventId, kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED', amountXof: pay.body.amountXof,
    });
    const send = () => t.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-signature', t.app.get(MockPaymentProvider).sign(body)).send(body);

    const ledger = t.app.get(LedgerService);
    jest.spyOn(ledger, 'post').mockImplementationOnce(async () => {
      throw new Error('ledger down');
    });

    await send().expect(500);
    let state = await t.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
    expect(state.body.status).toBe('PENDING');

    // The provider replays: it must be processed, not answered as a duplicate.
    const replay = await send().expect(200);
    expect(replay.body).toEqual({ ok: true });
    state = await t.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
    expect(state.body.status).toBe('SUCCEEDED');

    // And a further replay is still a duplicate: never credited twice.
    const again = await send().expect(200);
    expect(again.body).toEqual({ duplicate: true });
  });
});
