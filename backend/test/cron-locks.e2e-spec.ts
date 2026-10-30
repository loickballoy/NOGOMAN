/**
 * Issue #25 (rule 7): every scheduled task runs under withAdvisoryLock, so two API instances
 * never do the same work twice.
 *
 * Lock names expected by these tests (hashtext(name), as in src/common/advisory-lock.ts):
 * - `payouts:daily`     the daily payout pass (PayoutsService.scheduled, #18);
 * - `work:auto-release` the auto-release pass (WorkService.scheduled);
 * - `auth:purge`        the purge of login codes and sessions (AuthService.purge).
 *
 * The database is shared with the other e2e files and a pass may also touch their rows, so
 * every assertion is about the users, jobs and sessions created here.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { Accounts, LedgerService } from '../src/ledger/ledger.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkService } from '../src/work/work.service';
import { auth, bootApp, NEAR, phones, TestApp, TestJob, TestUser } from './helpers';

const phone = phones('025');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fees at 0 and a low rate floor, so that a task of N FCFA leaves exactly N on the worker's balance.
const EXACT = { FARMER_FEE_BPS: '0', WORKER_FEE_BPS: '0', MIN_DAILY_RATE_XOF: '100' };

const TERMINAL = ['RELEASED', 'MISSED', 'CANCELLED', 'REFUNDED'];

/**
 * Holds `pg_try_advisory_xact_lock(hashtext(name))` from a connection of its own, the way another
 * API instance in the middle of the task would, until `release()` is called.
 */
async function holdLock(holder: PrismaClient, name: string) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  // A real tick of one of our instances may hold the lock for a moment: retry for a few seconds.
  for (let attempt = 0; attempt < 50; attempt++) {
    let taken!: (locked: boolean) => void;
    const locked = new Promise<boolean>((resolve) => (taken = resolve));
    const done = holder.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`;
        taken(row.locked);
        if (row.locked) await gate;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    done.catch(() => taken(false));
    if (await locked) {
      return {
        release: async () => {
          open();
          await done;
        },
      };
    }
    await done.catch(() => undefined);
    await sleep(100);
  }
  throw new Error(`holdLock(): could not take ${name}`);
}

describe('advisory lock on every scheduled task (#25)', () => {
  const apps: TestApp[] = [];
  let holder: PrismaClient;

  const boot = async (...args: Parameters<typeof bootApp>) => {
    const t = await bootApp(...args);
    apps.push(t);
    return t;
  };
  /** Two API instances on the same database, with the scheduled tasks switched on. */
  const twoInstances = (env: Record<string, string> = {}) =>
    Promise.all([
      boot({ CRON_ENABLED: 'true', ...env }, { phones: phone }),
      boot({ CRON_ENABLED: 'true', ...env }, { phones: phone }),
    ]);

  beforeAll(async () => {
    holder = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
    await holder.$connect();
  });

  afterAll(async () => {
    await Promise.all(apps.map((t) => t.close()));
    await holder.$disconnect();
  });

  const prismaOf = (t: TestApp) => t.app.get(PrismaService);
  const ledgerOf = (t: TestApp) => t.app.get(LedgerService);

  // ---- payouts ---------------------------------------------------------------

  describe('daily payouts', () => {
    interface MyPayouts {
      balanceXof: number;
      payouts: { id: string; amountXof: number; status: string }[];
    }
    const payoutsOf = async (t: TestApp, user: TestUser): Promise<MyPayouts> =>
      (await t.http().get('/me/payouts').set(auth(user.token)).expect(200)).body;
    const payoutsJob = (t: TestApp) => t.app.get(SchedulerRegistry).getCronJob('payouts');

    /** PAYOUT journal entries that debit this user's balance. */
    const payoutEntriesOf = (t: TestApp, user: TestUser) =>
      prismaOf(t).journalEntry.count({
        where: { kind: 'PAYOUT', postings: { some: { account: { code: Accounts.payable(user.id).code } } } },
      });

    /** fireOnTick() does not wait for the async pass: poll, then leave time for a duplicate. */
    async function waitUntilPaid(t: TestApp, users: TestUser[], timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const states = await Promise.all(users.map((u) => payoutsOf(t, u)));
        if (states.every((s) => s.payouts.length > 0)) break;
        if (Date.now() > deadline) throw new Error('waitUntilPaid(): no payout within the timeout');
        await sleep(100);
      }
      await sleep(1500);
    }

    it('pays each user once when the `payouts` job fires on two instances at the same time', async () => {
      const [a, b] = await twoInstances(EXACT);
      const farmer = await a.farmer();
      const workers = [await a.worker(), await b.worker(), await a.worker()];
      const amounts = [3000, 2500, 4200];
      for (const [i, w] of workers.entries()) await (i % 2 ? b : a).paidTask(farmer, w, amounts[i]);
      for (const [i, w] of workers.entries()) {
        expect((await payoutsOf(a, w)).balanceXof).toBe(amounts[i]);
        expect(await payoutEntriesOf(a, w)).toBe(0);
      }

      await Promise.all([payoutsJob(a).fireOnTick(), payoutsJob(b).fireOnTick()]);
      await waitUntilPaid(a, workers);

      for (const [i, w] of workers.entries()) {
        const state = await payoutsOf(a, w);
        expect(state.payouts).toHaveLength(1);
        expect(state.payouts[0].amountXof).toBe(amounts[i]);
        expect(state.balanceXof).toBe(0);
        // One PAYOUT journal entry per payout: the balance was debited once.
        expect(await payoutEntriesOf(a, w)).toBe(state.payouts.length);
      }
      expect((await ledgerOf(a).trialBalance()).total).toBe(0);
    });

    it('does nothing while another instance holds `payouts:daily`, then pays once it is released', async () => {
      const [a, b] = await twoInstances(EXACT);
      const { farmer, worker } = await a.farmerAndWorker();
      await a.paidTask(farmer, worker, 2600);

      const lock = await holdLock(holder, 'payouts:daily');
      try {
        await Promise.all([a.app.get(PayoutsService).scheduled(), b.app.get(PayoutsService).scheduled()]);
        const held = await payoutsOf(a, worker);
        expect(held.payouts).toHaveLength(0);
        expect(held.balanceXof).toBe(2600);
        expect(await payoutEntriesOf(a, worker)).toBe(0);
      } finally {
        await lock.release();
      }

      await Promise.all([a.app.get(PayoutsService).scheduled(), b.app.get(PayoutsService).scheduled()]);
      const paid = await payoutsOf(a, worker);
      expect(paid.payouts).toHaveLength(1);
      expect(paid.payouts[0].amountXof).toBe(2600);
      expect(paid.balanceXof).toBe(0);
      expect(await payoutEntriesOf(a, worker)).toBe(1);
      expect((await ledgerOf(a).trialBalance()).total).toBe(0);
    });
  });

  // ---- auto-release ----------------------------------------------------------

  describe('auto-release', () => {
    interface Mission {
      job: TestJob;
      engagementId: string;
      worker: TestUser;
    }

    const unitsOf = async (t: TestApp, m: Mission): Promise<{ id: string; status: string }[]> =>
      (await t.http().get(`/engagements/${m.engagementId}`).set(auth(m.worker.token)).expect(200)).body.units;

    /** RELEASE and REFUND entries that move money out of this job's escrow. */
    const settlementsOf = (t: TestApp, m: Mission) =>
      prismaOf(t).journalEntry.count({
        where: {
          kind: { in: ['RELEASE', 'REFUND'] },
          postings: { some: { account: { code: Accounts.escrow(m.job.id).code } } },
        },
      });

    /** The escrow balance after each of its postings, in order: it must never go below zero. */
    async function escrowHistory(t: TestApp, m: Mission): Promise<number[]> {
      const postings = await prismaOf(t).posting.findMany({
        where: { account: { code: Accounts.escrow(m.job.id).code } },
        include: { entry: true },
        orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
      });
      let running = 0;
      return postings.map((p) => (running += p.amountXof));
    }

    /**
     * A DAILY job of 2 days (today checked in, tomorrow not) and a TASK marked as done: once due,
     * auto-release pays day 1 and the task, and refunds day 2 as MISSED.
     */
    async function missions(t: TestApp): Promise<Mission[]> {
      const farmer = await t.farmer();
      const daily = await t.postJob(farmer, { durationDays: 2 });
      const d = await t.hiredOn(daily);
      await t.fundAndSettle(daily);
      const task = await t.postJob(farmer, { title: 'Désherbage', category: 'WEEDING', payMode: 'TASK', rateXof: 3000 });
      const k = await t.hiredOn(task);
      await t.fundAndSettle(task);

      const dailyMission = { job: daily, engagementId: d.engagementId, worker: d.worker };
      const [today] = await unitsOf(t, dailyMission);
      await t.http().post(`/work-units/${today.id}/check-in`).set(auth(d.worker.token)).send(NEAR).expect(201);
      return [dailyMission, { job: task, engagementId: k.engagementId, worker: k.worker }];
    }

    /**
     * Makes the units of these missions due now, as if the farmer had let the confirmation window
     * pass: TASK units are already due (TASK_AUTO_RELEASE_HOURS=0), DAILY ones are due the next day.
     */
    async function makeDue(t: TestApp, ms: Mission[]) {
      for (const m of ms) {
        if (m.job.payMode === 'TASK') {
          const [unit] = await unitsOf(t, m);
          await t.http().post(`/work-units/${unit.id}/done`).set(auth(m.worker.token)).expect(201);
        } else {
          await prismaOf(t).workUnit.updateMany({
            where: { engagementId: m.engagementId, status: 'PENDING' },
            data: { autoReleaseAt: new Date(Date.now() - 60_000) },
          });
        }
      }
    }

    async function expectSettledOnce(t: TestApp, ms: Mission[]) {
      for (const m of ms) {
        const units = await unitsOf(t, m);
        for (const u of units) expect(TERMINAL).toContain(u.status);
        // One ledger entry per unit: none was released or refunded twice.
        expect(await settlementsOf(t, m)).toBe(units.length);
        const history = await escrowHistory(t, m);
        expect(Math.min(...history)).toBeGreaterThanOrEqual(0);
        expect(history[history.length - 1]).toBe(0);
      }
      const [daily, task] = ms;
      expect((await unitsOf(t, daily)).map((u) => u.status)).toEqual(['RELEASED', 'MISSED']);
      expect((await unitsOf(t, task)).map((u) => u.status)).toEqual(['RELEASED']);
    }

    it('settles each unit once when two instances run the scheduled pass at the same time', async () => {
      const [a, b] = await twoInstances({ TASK_AUTO_RELEASE_HOURS: '0' });
      const ms = [...(await missions(a)), ...(await missions(b))];
      await makeDue(a, ms);

      await Promise.all([a.app.get(WorkService).scheduled(), b.app.get(WorkService).scheduled()]);

      await expectSettledOnce(a, ms);
    });

    it('does nothing while another instance holds `work:auto-release`, then settles once it is released', async () => {
      const [a, b] = await twoInstances({ TASK_AUTO_RELEASE_HOURS: '0' });
      const ms = await missions(a);

      const lock = await holdLock(holder, 'work:auto-release');
      try {
        await makeDue(a, ms);
        await Promise.all([a.app.get(WorkService).scheduled(), b.app.get(WorkService).scheduled()]);
        for (const m of ms) {
          for (const u of await unitsOf(a, m)) expect(u.status).toBe('PENDING');
          expect(await settlementsOf(a, m)).toBe(0);
        }
      } finally {
        await lock.release();
      }

      await Promise.all([a.app.get(WorkService).scheduled(), b.app.get(WorkService).scheduled()]);
      await expectSettledOnce(a, ms);
    });
  });

  // ---- purge -----------------------------------------------------------------

  describe('purge of login codes and sessions', () => {
    it('does nothing while another instance holds `auth:purge`, then purges once it is released', async () => {
      const [a, b] = await twoInstances();
      const user = await a.login();
      // An expired session of this user: the purge deletes it.
      await prismaOf(a).session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      const sessionsOf = () => prismaOf(a).session.count({ where: { userId: user.id } });
      expect(await sessionsOf()).toBeGreaterThan(0);

      const lock = await holdLock(holder, 'auth:purge');
      try {
        await Promise.all([a.app.get(AuthService).purge(), b.app.get(AuthService).purge()]);
        expect(await sessionsOf()).toBeGreaterThan(0);
      } finally {
        await lock.release();
      }

      await Promise.all([a.app.get(AuthService).purge(), b.app.get(AuthService).purge()]);
      expect(await sessionsOf()).toBe(0);
    });
  });

  // ---- every scheduled task --------------------------------------------------

  /**
   * Static check on the source text of src/: every method decorated with @Cron (or @Interval,
   * @Timeout), and every method a CronJob registered by hand calls from its onTick, must call
   * withAdvisoryLock in its own body. Simple and readable; the SchedulerRegistry of a running
   * instance then confirms that the scan found every job actually scheduled.
   */
  describe('every scheduled method goes through withAdvisoryLock', () => {
    const SRC = join(__dirname, '..', 'src');

    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
      });

    /** Index of the bracket closing the one at `open`. */
    function closing(text: string, open: number): number {
      const pair: Record<string, string> = { '(': ')', '{': '}' };
      const [o, c] = [text[open], pair[text[open]]];
      let depth = 0;
      for (let i = open; i < text.length; i++) {
        if (text[i] === o) depth++;
        else if (text[i] === c && --depth === 0) return i;
      }
      throw new Error('unbalanced brackets');
    }

    /** Body of the method declared at `from` (name, parameters, optional return type, then `{`). */
    function bodyAt(text: string, from: number): string {
      const params = text.indexOf('(', from);
      const brace = text.indexOf('{', closing(text, params));
      return text.slice(brace, closing(text, brace) + 1);
    }

    function methodBody(text: string, name: string): string | undefined {
      const decl = new RegExp(`^\\s*(?:(?:public|private|protected|async)\\s+)*${name}\\s*\\(`, 'm').exec(text);
      return decl ? bodyAt(text, decl.index) : undefined;
    }

    interface Scheduled {
      where: string;
      kind: string;
      body: string | undefined;
    }

    function scan() {
      const found: Scheduled[] = [];
      const intervals: string[] = [];
      for (const file of sourceFiles(SRC)) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(SRC, file);

        // @Cron(...) / @Interval(...) / @Timeout(...), other decorators, then the method.
        const decorated = /@(Cron|Interval|Timeout)\(/g;
        for (let m: RegExpExecArray | null; (m = decorated.exec(text)); ) {
          let at = closing(text, m.index + m[0].length - 1) + 1;
          for (let d: RegExpExecArray | null; (d = /^\s*@\w+/.exec(text.slice(at))); ) {
            at += d[0].length;
            if (text[at] === '(') at = closing(text, at) + 1;
          }
          const name = /^\s*(?:(?:public|private|protected|async)\s+)*(\w+)\s*\(/.exec(text.slice(at));
          found.push({
            where: `${rel}: @${m[1]} ${name?.[1] ?? '?'}`,
            kind: m[1],
            body: name ? bodyAt(text, at) : undefined,
          });
        }

        // Jobs registered by hand: CronJob.from / new CronJob with onTick: () => this.method().
        const ticks = [...text.matchAll(/onTick:\s*(?:async\s*)?\(\)\s*=>\s*(?:void\s+)?this\.(\w+)\(/g)];
        for (const m of ticks) {
          found.push({ where: `${rel}: onTick ${m[1]}`, kind: 'CronJob', body: methodBody(text, m[1]) });
        }
        const jobs = (text.match(/(CronJob\.from|new CronJob)\(/g) ?? []).length;
        if (jobs > ticks.length) {
          found.push({ where: `${rel}: CronJob without onTick: () => this.method()`, kind: 'CronJob', body: undefined });
        }

        if (/\bsetInterval\(/.test(text)) intervals.push(rel);
      }
      return { found, intervals };
    }

    it('finds the three known tasks and each one calls withAdvisoryLock', () => {
      const { found } = scan();
      const names = found.map((s) => s.where);
      expect(names).toEqual(expect.arrayContaining([
        expect.stringMatching(/work\.service\.ts: @Cron scheduled$/),
        expect.stringMatching(/auth\.service\.ts: @Cron purge$/),
        expect.stringMatching(/payouts\.service\.ts: onTick scheduled$/),
      ]));

      const unlocked = found.filter((s) => !s.body || !/\bwithAdvisoryLock\s*\(/.test(s.body)).map((s) => s.where);
      expect(unlocked).toEqual([]);
    });

    it('leaves no setInterval outside the scheduler', () => {
      expect(scan().intervals).toEqual([]);
    });

    it('matches what the SchedulerRegistry of a running instance holds', async () => {
      const t = await boot({}, { phones: phone });
      const registry = t.app.get(SchedulerRegistry);
      const { found } = scan();
      const count = (...kinds: string[]) => found.filter((s) => kinds.includes(s.kind)).length;
      expect(registry.getCronJobs().size).toBe(count('Cron', 'CronJob'));
      expect(registry.getIntervals().length).toBe(count('Interval'));
      expect(registry.getTimeouts().length).toBe(count('Timeout'));
    });
  });
});
