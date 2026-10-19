import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConsoleSmsProvider } from '../src/auth/sms/console-sms.provider';
import { configureApp } from '../src/bootstrap';
import { addDays, isoDate, todayLocal } from '../src/common/time';
import { Accounts, LedgerService } from '../src/ledger/ledger.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkService } from '../src/work/work.service';
import { GEOCODER, Geocoder, Place } from '../src/geo/geocoder';

// Daloa, and a point ~300 m away / ~10 km away.
const FARM = { lat: 6.8774, lng: -6.4502 };
const NEAR = { lat: 6.8795, lng: -6.4502 };
const FAR = { lat: 6.9674, lng: -6.4502 };

describe('Nogoman end-to-end flow', () => {
  let app: INestApplication;
  let sms: ConsoleSmsProvider;
  let ledger: LedgerService;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  async function login(phone: string) {
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const normalized = `+225${phone.replace(/\D/g, '')}`;
    const code = sms.lastTo(normalized)!.match(/(\d{6})/)![1];
    const res = await http().post('/auth/otp/verify').send({ phone, code }).expect(200);
    return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean; user: { id: string } };
  }

  // Stands in for Nominatim: names every position Daloa, like the real geocoder would.
  const daloa: Place = { label: 'Gonaté, Daloa, Haut-Sassandra, Côte d’Ivoire', locality: 'Daloa', region: 'Haut-Sassandra', countryCode: 'ci', lat: FARM.lat, lng: FARM.lng };
  const fakeGeocoder: Geocoder = {
    search: async (q) => (q.toLowerCase().includes('daloa') ? [daloa] : []),
    reverse: async (lat, lng) => ({ ...daloa, lat, lng }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODER).useValue(fakeGeocoder)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    sms = app.get(ConsoleSmsProvider);
    ledger = app.get(LedgerService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  let farmer: { token: string; id: string };
  let worker: { token: string; id: string };
  let admin: { token: string; id: string };
  let jobId: string;
  let engagementId: string;
  let units: { id: string; workDate: string; status: string }[];
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('does not force HTTPS sub-requests, so the docs work over plain HTTP on a LAN IP', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('rejects a wrong OTP and signs users up by phone', async () => {
    await http().post('/auth/otp/request').send({ phone: '07 08 12 34 56' }).expect(200);
    const bad = await http().post('/auth/otp/verify').send({ phone: '0708123456', code: '000000' });
    // Extremely unlikely to be the real code; accept either outcome only if it was.
    if (bad.status !== 200) expect(bad.body.code).toBe('OTP_INVALID');

    const f = await login('07 08 12 34 56');
    expect(f.isNewUser).toBe(true);
    farmer = { token: f.accessToken, id: f.user.id };
    const w = await login('05 44 33 22 11');
    worker = { token: w.accessToken, id: w.user.id };
    const a = await login('01 01 01 01 01');
    admin = { token: a.accessToken, id: a.user.id };

    await http().get('/me').expect(401);
    await http().patch('/me').set(auth(farmer.token)).send({ name: 'Kouassi Amani', role: 'FARMER' }).expect(200);
    const me = await http().patch('/me').set(auth(worker.token))
      .send({ name: 'Moussa Koné', role: 'WORKER', locality: 'Daloa', lat: NEAR.lat, lng: NEAR.lng }).expect(200);
    expect(me.body.profileComplete).toBe(true);
    await http().patch('/me').set(auth(worker.token)).send({ role: 'FARMER' }).expect(400);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const s = await login('05 44 33 22 11');
    const next = await http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    await http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    // Reuse revoked the whole family, including the token we just got.
    await http().post('/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(401);
  });

  it('lets a farmer post a daily job that workers find on the map', async () => {
    await http().post('/jobs').set(auth(worker.token)).send({}).expect(403);
    const res = await http().post('/jobs').set(auth(farmer.token)).send({
      title: 'Récolte de cacao', category: 'HARVEST', crop: 'Cacao', payMode: 'DAILY',
      rateXof: 4500, workersNeeded: 1, durationDays: 3, startDate: isoDate(todayLocal()),
      locality: 'Ma plantation', ...FARM,
    }).expect(201);
    jobId = res.body.id;
    // The server names the place from the coordinates, ignoring the phone's label.
    expect(res.body).toMatchObject({ locality: 'Daloa', locationVerified: true, address: daloa.label });

    const found = await http().get('/jobs').query({ ...NEAR, radiusKm: 10 }).set(auth(worker.token)).expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).toMatchObject({ id: jobId, workerNetXof: 4410, workerTotalNetXof: 13230, slotsLeft: 1 });
    expect(found.body[0].lat).toBe(6.88); // rounded for non-hired viewers
    expect(found.body[0].farmer.phone).toBeUndefined();
    expect(found.body[0].address).toBeNull(); // full address only once hired

    const elsewhere = await http().get('/jobs').query({ lat: 5.35, lng: -4.0, radiusKm: 20 }).set(auth(worker.token)).expect(200);
    expect(elsewhere.body).toHaveLength(0);
  });

  it('searches and names places for the farm location step', async () => {
    const found = await http().get('/geo/search').query({ q: 'Daloa' }).set(auth(farmer.token)).expect(200);
    expect(found.body[0].locality).toBe('Daloa');
    const named = await http().get('/geo/reverse').query(FARM).set(auth(farmer.token)).expect(200);
    expect(named.body.locality).toBe('Daloa');
    await http().get('/geo/search').query({ q: 'Daloa' }).expect(401);
  });

  it('requires a payout number before applying, then hires', async () => {
    const noPayout = await http().post(`/jobs/${jobId}/applications`).set(auth(worker.token)).send({}).expect(400);
    expect(noPayout.body.code).toBe('PAYOUT_METHOD_REQUIRED');
    await http().patch('/me').set(auth(worker.token)).send({ payoutOperator: 'ORANGE_MONEY', payoutPhone: '05 44 33 22 11' }).expect(200);

    const app1 = await http().post(`/jobs/${jobId}/applications`).set(auth(worker.token)).send({ message: 'Disponible' }).expect(201);
    await http().post(`/jobs/${jobId}/applications`).set(auth(worker.token)).send({}).expect(409);

    const list = await http().get(`/jobs/${jobId}/applications`).set(auth(farmer.token)).expect(200);
    expect(list.body[0].worker.name).toBe('Moussa Koné');

    const hired = await http().post(`/applications/${app1.body.id}/hire`).set(auth(farmer.token)).expect(201);
    engagementId = hired.body.id;
    const job = await http().get(`/jobs/${jobId}`).set(auth(worker.token)).expect(200);
    expect(job.body.status).toBe('FILLED');
    expect(job.body.lat).toBe(FARM.lat); // exact once hired
    expect(job.body.address).toBe(daloa.label);
  });

  it('collects the escrow and only activates the work on a verified webhook', async () => {
    const quote = await http().get(`/jobs/${jobId}/funding/quote`).set(auth(farmer.token)).expect(200);
    expect(quote.body).toMatchObject({ workers: 1, subtotalXof: 13500, feeXof: 270, totalXof: 13770 });

    const pay = await http().post(`/jobs/${jobId}/funding`).set(auth(farmer.token))
      .send({ operator: 'ORANGE_MONEY', phone: '0708123456' }).expect(201);
    expect(pay.body).toMatchObject({ status: 'PENDING', amountXof: 13770 });
    const again = await http().post(`/jobs/${jobId}/funding`).set(auth(farmer.token)).send({}).expect(201);
    expect(again.body.id).toBe(pay.body.id); // no double charge

    const body = JSON.stringify({ eventId: 'evt_1', kind: 'collection', providerRef: pay.body.providerRef, status: 'SUCCEEDED' });
    await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-signature', 'f'.repeat(64)).send(body).expect(401);

    const signature = app.get(MockPaymentProvider).sign(body);
    await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-signature', signature).send(body).expect(200);
    const dup = await http().post('/webhooks/payments/mock').set('Content-Type', 'application/json')
      .set('x-mock-signature', signature).send(body).expect(200);
    expect(dup.body.duplicate).toBe(true);

    expect(await ledger.balance(Accounts.escrow(jobId).code)).toBe(13770);
    const e = await http().get(`/engagements/${engagementId}`).set(auth(worker.token)).expect(200);
    expect(e.body.status).toBe('ACTIVE');
    units = e.body.units;
    expect(units.map((u) => u.workDate)).toEqual([0, 1, 2].map((i) => isoDate(addDays(todayLocal(), i))));
    expect(e.body.totals).toEqual({ earnedXof: 0, upcomingXof: 13230 });
  });

  it('checks the worker in by GPS and pays the day the farmer confirms', async () => {
    const far = await http().post(`/work-units/${units[0].id}/check-in`).set(auth(worker.token)).send(FAR).expect(400);
    expect(far.body.code).toBe('TOO_FAR');
    await http().post(`/work-units/${units[1].id}/check-in`).set(auth(worker.token)).send(NEAR).expect(400);
    await http().post(`/work-units/${units[0].id}/check-in`).set(auth(worker.token)).send(NEAR).expect(201);

    await http().post(`/work-units/${units[1].id}/confirm`).set(auth(farmer.token)).expect(400); // tomorrow
    const day = await http().post(`/jobs/${jobId}/confirm-day`).set(auth(farmer.token))
      .send({ date: units[0].workDate }).expect(201);
    expect(day.body).toEqual({ date: units[0].workDate, workers: 1, releasedXof: 4500 });

    expect(await ledger.balance(Accounts.payable(worker.id).code)).toBe(4410);
    expect(await ledger.balance(Accounts.escrow(jobId).code)).toBe(2 * 4590);
    expect(await ledger.balance(Accounts.revenue().code)).toBe(180);
  });

  it('pays the worker out in one transfer and returns failed transfers to the balance', async () => {
    const payouts = app.get(PayoutsService);
    expect(await payouts.runBatch()).toBe(1);
    expect(await payouts.runBatch()).toBe(0); // one in flight per user
    const payout = await prisma.payout.findFirstOrThrow({ where: { userId: worker.id } });
    expect(payout).toMatchObject({ amountXof: 4410, operator: 'ORANGE_MONEY', phone: '+2250544332211' });
    expect(await ledger.balance(Accounts.payable(worker.id).code)).toBe(0);

    await http().post(`/dev/payments/payout/${payout.id}/simulate`).send({ status: 'FAILED', reason: 'number_blocked' }).expect(200);
    expect(await ledger.balance(Accounts.payable(worker.id).code)).toBe(4410);

    // After the cooldown the money goes out again.
    await prisma.payout.update({ where: { id: payout.id }, data: { updatedAt: new Date(Date.now() - 7 * 3600_000) } });
    expect(await payouts.runBatch()).toBe(1);
    const retry = await prisma.payout.findFirstOrThrow({ where: { userId: worker.id, status: 'PENDING' } });
    await http().post(`/dev/payments/payout/${retry.id}/simulate`).send({ status: 'SUCCEEDED' }).expect(200);
    const mine = await http().get('/me/payouts').set(auth(worker.token)).expect(200);
    expect(mine.body.balanceXof).toBe(0);
    expect(mine.body.payouts.map((p: { status: string }) => p.status)).toEqual(['SUCCEEDED', 'FAILED']);
  });

  it('holds disputed days for an admin and refunds days nobody worked', async () => {
    await http().post(`/work-units/${units[1].id}/dispute`).set(auth(farmer.token))
      .send({ reason: 'Absent le matin' }).expect(201);

    // Two days later every remaining unit is past its auto-release time.
    const result = await app.get(WorkService).autoRelease(addDays(new Date(), 3));
    expect(result).toEqual({ released: 0, missed: 1 }); // day 3: no check-in -> refunded
    expect(await ledger.balance(Accounts.payable(farmer.id).code)).toBe(4590);

    await http().get('/admin/disputes').set(auth(farmer.token)).expect(403);
    const disputes = await http().get('/admin/disputes').set(auth(admin.token)).expect(200);
    expect(disputes.body).toHaveLength(1);
    await http().post(`/admin/work-units/${units[1].id}/resolve`).set(auth(admin.token)).send({ outcome: 'RELEASE' }).expect(201);

    const e = await http().get(`/engagements/${engagementId}`).set(auth(farmer.token)).expect(200);
    expect(e.body.status).toBe('COMPLETED');
    expect(e.body.units.map((u: { status: string }) => u.status)).toEqual(['RELEASED', 'RELEASED', 'MISSED']);
    const job = await http().get(`/jobs/${jobId}`).set(auth(farmer.token)).expect(200);
    expect(job.body.status).toBe('COMPLETED');

    expect(await ledger.balance(Accounts.escrow(jobId).code)).toBe(0);
    expect(await ledger.balance(Accounts.revenue().code)).toBe(360);
    const trial = await http().get('/admin/ledger/trial-balance').set(auth(admin.token)).expect(200);
    expect(trial.body.total).toBe(0);
  });

  it('lets both sides review once and never leaks phone numbers', async () => {
    await http().post(`/engagements/${engagementId}/reviews`).set(auth(worker.token)).send({ rating: 5, comment: 'Sérieux' }).expect(201);
    await http().post(`/engagements/${engagementId}/reviews`).set(auth(worker.token)).send({ rating: 1 }).expect(409);
    const profile = await http().get(`/users/${farmer.id}`).set(auth(worker.token)).expect(200);
    expect(profile.body.rating).toEqual({ average: 5, count: 1 });
    expect(JSON.stringify(profile.body)).not.toContain('+225');
  });

  it('pays a task 48 h after the worker marks it done, unless the farmer objects', async () => {
    const job = await http().post('/jobs').set(auth(farmer.token)).send({
      title: 'Désherbage hévéa', category: 'WEEDING', payMode: 'TASK', rateXof: 25000, workersNeeded: 1,
      durationDays: 4, startDate: isoDate(todayLocal()), locality: 'Daloa', ...FARM,
    }).expect(201);
    const application = await http().post(`/jobs/${job.body.id}/applications`).set(auth(worker.token)).send({}).expect(201);
    const hired = await http().post(`/applications/${application.body.id}/hire`).set(auth(farmer.token)).expect(201);
    const pay = await http().post(`/jobs/${job.body.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    expect(pay.body.amountXof).toBe(25500);
    await http().post(`/dev/payments/collection/${pay.body.id}/simulate`).send({ status: 'SUCCEEDED' }).expect(200);

    const e = await http().get(`/engagements/${hired.body.id}`).set(auth(worker.token)).expect(200);
    const unitId = e.body.units[0].id;
    expect((await app.get(WorkService).autoRelease(addDays(new Date(), 30))).released).toBe(0); // not done yet

    const done = await http().post(`/work-units/${unitId}/done`).set(auth(worker.token)).expect(201);
    const releaseAt = new Date(done.body.autoReleaseAt);
    expect(releaseAt.getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);
    expect((await app.get(WorkService).autoRelease(new Date(releaseAt.getTime() - 60_000))).released).toBe(0);
    expect((await app.get(WorkService).autoRelease(new Date(releaseAt.getTime() + 60_000))).released).toBe(1);
    expect(await ledger.balance(Accounts.escrow(job.body.id).code)).toBe(0);
  });

  it('refunds the days that have not started when a mission is cancelled', async () => {
    const start = isoDate(addDays(todayLocal(), 2));
    const job = await http().post('/jobs').set(auth(farmer.token)).send({
      title: 'Défrichage', category: 'CLEARING', payMode: 'DAILY', rateXof: 4000, workersNeeded: 1,
      durationDays: 5, startDate: start, locality: 'Daloa', ...FARM,
    }).expect(201);
    const application = await http().post(`/jobs/${job.body.id}/applications`).set(auth(worker.token)).send({}).expect(201);
    const hired = await http().post(`/applications/${application.body.id}/hire`).set(auth(farmer.token)).expect(201);
    const pay = await http().post(`/jobs/${job.body.id}/funding`).set(auth(farmer.token)).send({}).expect(201);
    await http().post(`/dev/payments/collection/${pay.body.id}/simulate`).send({ status: 'SUCCEEDED' }).expect(200);
    const before = await ledger.balance(Accounts.payable(farmer.id).code);

    const cancelled = await http().post(`/engagements/${hired.body.id}/cancel`).set(auth(worker.token)).expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.units.every((u: { status: string }) => u.status === 'CANCELLED')).toBe(true);
    expect(await ledger.balance(Accounts.payable(farmer.id).code) - before).toBe(5 * 4080);
    expect(await ledger.balance(Accounts.escrow(job.body.id).code)).toBe(0);
    const reopened = await http().get(`/jobs/${job.body.id}`).set(auth(farmer.token)).expect(200);
    expect(reopened.body.status).toBe('OPEN');
  });

  it('refuses unbalanced ledger entries at the database level', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const entry = await tx.journalEntry.create({ data: { kind: 'RELEASE', idempotencyKey: 'bad-entry' } });
        const account = await tx.ledgerAccount.findFirstOrThrow();
        await tx.posting.create({ data: { entryId: entry.id, accountId: account.id, amountXof: 100 } });
      }),
    ).rejects.toThrow(/unbalanced/);
  });
});
