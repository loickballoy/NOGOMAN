import { randomUUID } from 'crypto';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
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
      .set(t.app.get(MockPaymentProvider).signedHeaders(body)).send(body);

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

  it('answers 409 while an unprocessed record is fresh, and takes it over once stale (release failed)', async () => {
    const { farmer } = await t.farmerAndWorker();
    const job = await t.postJob(farmer);
    await t.hiredOn(job);
    const pay = await t.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    const eventId = `e2e_${randomUUID()}`;
    const body = JSON.stringify({
      eventId, kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED', amountXof: pay.body.amountXof,
    });
    const send = () => t.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set(t.app.get(MockPaymentProvider).signedHeaders(body)).send(body);
    // A record left behind (process killed, or the release itself failed).
    const prisma = t.app.get(PrismaService);
    await prisma.webhookEvent.create({ data: { provider: 'mock', eventId, payload: {} } });

    const busy = await send().expect(409);
    expect(busy.body.code).toBe('WEBHOOK_IN_PROGRESS');

    await prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'mock', eventId } },
      data: { createdAt: new Date(Date.now() - 5 * 60_000) },
    });
    await send().expect(200);
    const state = await t.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
    expect(state.body.status).toBe('SUCCEEDED');
    expect((await send().expect(200)).body).toEqual({ duplicate: true });
  });

  it('releases an event for a collection not known yet, so the retry can apply it', async () => {
    const { farmer } = await t.farmerAndWorker();
    const job = await t.postJob(farmer);
    await t.hiredOn(job);
    const pay = await t.http().post(`/jobs/${job.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    const prisma = t.app.get(PrismaService);
    const eventId = `e2e_${randomUUID()}`;
    const body = JSON.stringify({
      eventId, kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED', amountXof: pay.body.amountXof,
    });
    const send = () => t.http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set(t.app.get(MockPaymentProvider).signedHeaders(body)).send(body);

    // The webhook outruns the providerRef save: the payment cannot be found yet.
    await prisma.payment.update({ where: { id: pay.body.id }, data: { providerRef: null } });
    const early = await send().expect(409);
    expect(early.body.code).toBe('WEBHOOK_PAYMENT_UNKNOWN');

    await prisma.payment.update({ where: { id: pay.body.id }, data: { providerRef: pay.body.providerRef } });
    await send().expect(200);
    const state = await t.http().get(`/payments/${pay.body.id}`).set(auth(farmer.token)).expect(200);
    expect(state.body.status).toBe('SUCCEEDED');
  });
});
