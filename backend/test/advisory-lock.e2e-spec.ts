import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { withAdvisoryLock } from '../src/common/advisory-lock';

// Issue #12 (rule 7): a scheduled task must not run twice when several instances are up.
// Each PrismaClient below has its own connection pool and stands in for one API instance.
const SLOW_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withAdvisoryLock (pg_try_advisory_xact_lock)', () => {
  let instanceA: PrismaClient;
  let instanceB: PrismaClient;
  // A fresh name per test, so a lock left over by a failing test cannot leak into the next one.
  const lockName = (label: string) => `test:${label}:${randomUUID()}`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL!;
    instanceA = new PrismaClient({ datasources: { db: { url } } });
    instanceB = new PrismaClient({ datasources: { db: { url } } });
    await Promise.all([instanceA.$connect(), instanceB.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([instanceA.$disconnect(), instanceB.$disconnect()]);
  });

  it('runs exactly one of two concurrent calls with the same name, and the other returns without waiting', async () => {
    const name = lockName('same');
    let runs = 0;
    const settled: string[] = [];
    const slow = (label: string) => async () => {
      runs += 1;
      await sleep(SLOW_MS);
      return label;
    };

    const track = async <T extends { ran: boolean }>(call: Promise<T>) => {
      const r = await call;
      settled.push(r.ran ? 'ran' : 'skipped');
      return r;
    };

    const [a, b] = await Promise.all([
      track(withAdvisoryLock(instanceA, name, slow('a'))),
      track(withAdvisoryLock(instanceB, name, slow('b'))),
    ]);

    expect([a.ran, b.ran].filter(Boolean)).toHaveLength(1);
    expect(runs).toBe(1);
    const [winner, loser] = a.ran ? [a, b] : [b, a];
    expect(winner).toEqual({ ran: true, result: a.ran ? 'a' : 'b' });
    expect(loser).toEqual({ ran: false });
    // "sans attendre": the skipped call comes back while the other one still holds the lock.
    expect(settled).toEqual(['skipped', 'ran']);
  });

  it('runs both calls when the names differ', async () => {
    let running = 0;
    let maxRunning = 0;
    const slow = (label: string) => async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(SLOW_MS);
      running -= 1;
      return label;
    };

    const [a, b] = await Promise.all([
      withAdvisoryLock(instanceA, lockName('first'), slow('a')),
      withAdvisoryLock(instanceB, lockName('second'), slow('b')),
    ]);

    expect(a).toEqual({ ran: true, result: 'a' });
    expect(b).toEqual({ ran: true, result: 'b' });
    expect(maxRunning).toBe(2);
  });

  it('releases the lock when fn throws, so the next call runs', async () => {
    const name = lockName('error');
    const boom = new Error('fn failed');

    await expect(
      withAdvisoryLock(instanceA, name, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    // From another instance, so a lock still held by instance A's connection would be seen.
    const next = await withAdvisoryLock(instanceB, name, async () => 'ran again');
    expect(next).toEqual({ ran: true, result: 'ran again' });

    // And from the same instance, which may reuse the very connection that held the lock.
    const again = await withAdvisoryLock(instanceA, name, async () => 42);
    expect(again).toEqual({ ran: true, result: 42 });
  });
});
