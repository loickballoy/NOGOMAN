/**
 * Issue #17: a job's rate can't be below MIN_DAILY_RATE_XOF (default 2 000 FCFA), in DAILY and
 * TASK modes, on POST /jobs and on PATCH /jobs/:id. Refusal: 400 { code: 'RATE_TOO_LOW', message }.
 */
import { isoDate, todayLocal } from '../src/common/time';
import { auth, bootApp, FARM, phones, TestApp, TestUser } from './helpers';

const phone = phones('017');

/** A valid POST /jobs body: only the rate (and pay mode) vary between cases. */
const jobBody = (fields: Record<string, unknown> = {}) => ({
  title: 'Récolte de cacao', category: 'HARVEST', payMode: 'DAILY', rateXof: 4500, workersNeeded: 1,
  durationDays: 3, startDate: isoDate(todayLocal()), locality: 'Daloa', ...FARM, ...fields,
});

/** Business errors are { code, message } with a plain French message (CLAUDE.md, rule 9). */
function expectRateTooLow(res: { status: number; body: any }) {
  expect({ status: res.status, code: res.body?.code }).toEqual({ status: 400, code: 'RATE_TOO_LOW' });
  const { message } = res.body;
  expect(typeof message).toBe('string');
  expect(message.trim()).not.toBe('');
  expect(message).not.toContain('_');
  // A sentence for people, not a code or a validator's English message.
  expect(message).not.toBe(res.body.code);
  expect(message).toMatch(/\s/);
  expect(message).not.toMatch(/\b(must|should|not|than|Bad Request)\b/i);
}

describe('Rate floor MIN_DAILY_RATE_XOF (RATE_TOO_LOW)', () => {
  const apps: TestApp[] = [];
  /** Every job a test created, cancelled at the end if it is still open. */
  const created: { t: TestApp; farmer: TestUser; id: string }[] = [];
  let t: TestApp;
  let farmer: TestUser;

  const post = async (app: TestApp, owner: TestUser, fields: Record<string, unknown>) => {
    const res = await app.http().post('/jobs').set(auth(owner.token)).send(jobBody(fields));
    if (res.status === 201 && res.body?.id) created.push({ t: app, farmer: owner, id: res.body.id });
    return res;
  };

  beforeAll(async () => {
    t = await bootApp({}, { phones: phone });
    apps.push(t);
    farmer = await t.farmer();
  });

  afterAll(async () => {
    for (const job of created) {
      const res = await job.t.http().get(`/jobs/${job.id}`).set(auth(job.farmer.token));
      if (res.body?.status === 'OPEN') {
        await job.t.http().post(`/jobs/${job.id}/cancel`).set(auth(job.farmer.token)).expect(201);
      }
    }
    await Promise.all(apps.map((a) => a.close()));
  });

  describe('default floor (2 000 FCFA)', () => {
    it('refuses a DAILY job at 1 999 FCFA', async () => {
      expectRateTooLow(await post(t, farmer, { payMode: 'DAILY', rateXof: 1999 }));
    });

    it('accepts a DAILY job at 2 000 FCFA', async () => {
      const res = await post(t, farmer, { payMode: 'DAILY', rateXof: 2000 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ payMode: 'DAILY', rateXof: 2000 });
    });

    it('refuses a TASK job at 1 999 FCFA', async () => {
      expectRateTooLow(await post(t, farmer, { payMode: 'TASK', rateXof: 1999 }));
    });

    it('accepts a TASK job at 2 000 FCFA', async () => {
      const res = await post(t, farmer, { payMode: 'TASK', rateXof: 2000 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ payMode: 'TASK', rateXof: 2000 });
    });

    it('refuses to lower an open job to 1 999 FCFA and keeps its rate', async () => {
      const res = await post(t, farmer, { payMode: 'DAILY', rateXof: 4500 });
      expect(res.status).toBe(201);
      const id = res.body.id;

      const patch = await t.http().patch(`/jobs/${id}`).set(auth(farmer.token)).send({ rateXof: 1999 });
      expectRateTooLow(patch);

      const job = await t.http().get(`/jobs/${id}`).set(auth(farmer.token)).expect(200);
      expect(job.body.rateXof).toBe(4500);
    });

    it('lets an open job be changed to 2 500 FCFA', async () => {
      const res = await post(t, farmer, { payMode: 'DAILY', rateXof: 4500 });
      expect(res.status).toBe(201);

      const patch = await t.http().patch(`/jobs/${res.body.id}`).set(auth(farmer.token)).send({ rateXof: 2500 });
      expect(patch.status).toBe(200);
      expect(patch.body.rateXof).toBe(2500);
    });
  });

  describe('MIN_DAILY_RATE_XOF=3000', () => {
    it('refuses a job at 2 500 FCFA', async () => {
      const t3 = await bootApp({ MIN_DAILY_RATE_XOF: '3000' }, { phones: phone });
      apps.push(t3);
      const farmer3 = await t3.farmer();
      expectRateTooLow(await post(t3, farmer3, { payMode: 'DAILY', rateXof: 2500 }));
    });
  });
});
