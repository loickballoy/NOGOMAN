import { auth, bootApp, phones, TestApp } from './helpers';

const phone = phones('015');

describe('e2e helpers (smoke)', () => {
  const apps: TestApp[] = [];
  const boot = async (...args: Parameters<typeof bootApp>) => {
    const t = await bootApp(...args);
    apps.push(t);
    return t;
  };

  afterAll(async () => {
    await Promise.all(apps.map((t) => t.close()));
  });

  it('starts the API with the given env and restores process.env', async () => {
    const before = process.env.FARMER_FEE_BPS;
    const t = await boot({ FARMER_FEE_BPS: '0' }, { phones: phone });
    expect(process.env.FARMER_FEE_BPS).toBe(before);

    const { farmer } = await t.farmerAndWorker();
    const job = await t.postJob(farmer);
    await t.hiredOn(job);
    const quote = await t.http().get(`/jobs/${job.id}/funding/quote`).set(auth(farmer.token)).expect(200);
    expect(quote.body).toMatchObject({ workers: 1, subtotalXof: 13500, feeXof: 0, feeBps: 0, totalXof: 13500 });
  });

  it('runs two instances started at the same time on the same database', async () => {
    const [a, b] = await Promise.all([
      boot({ FARMER_FEE_BPS: '0' }, { phones: phone }),
      boot({ FARMER_FEE_BPS: '300' }, { phones: phone }),
    ]);
    await Promise.all([a.http().get('/health').expect(200), b.http().get('/health').expect(200)]);

    // Each instance kept its own configuration.
    const farmer = await a.farmer();
    const job = await a.postJob(farmer);
    await a.hiredOn(job);
    const quoteA = await a.http().get(`/jobs/${job.id}/funding/quote`).set(auth(farmer.token)).expect(200);
    const quoteB = await b.http().get(`/jobs/${job.id}/funding/quote`).set(auth(farmer.token)).expect(200);
    expect(quoteA.body).toMatchObject({ feeBps: 0, feeXof: 0, totalXof: 13500 });
    expect(quoteB.body).toMatchObject({ feeBps: 300, feeXof: 405, totalXof: 13905 });

    // A user signed up on one instance is known to the other.
    const worker = await b.worker();
    await a.http().get('/me').set(auth(worker.token)).expect(200);
  });

  it('pays a task and credits the worker with the net amount', async () => {
    const t = await boot({ FARMER_FEE_BPS: '200', WORKER_FEE_BPS: '200' }, { phones: phone });
    const { farmer, worker } = await t.farmerAndWorker();
    const before = (await t.http().get('/me/payouts').set(auth(worker.token)).expect(200)).body.balanceXof;

    const task = await t.paidTask(farmer, worker, 10_000);
    expect(task.netXof).toBe(9800);
    expect(task.funding.amountXof).toBe(10_200);

    const after = (await t.http().get('/me/payouts').set(auth(worker.token)).expect(200)).body.balanceXof;
    expect(after - before).toBe(9800);
    const e = await t.http().get(`/engagements/${task.engagementId}`).set(auth(worker.token)).expect(200);
    expect(e.body).toMatchObject({ status: 'COMPLETED', totals: { earnedXof: 9800, upcomingXof: 0 } });
  });
});
