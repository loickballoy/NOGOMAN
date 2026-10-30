/**
 * Issue #24 — AdminAuditLog: every admin action that changes something leaves exactly one row
 * (who, what, on what, before, after, when), written in the action's own transaction, and the
 * table is append-only. Rows are read back through GET /admin/audit-log.
 *
 * Every e2e file shares the database: this file only looks at rows written by its own admin
 * (a fictitious number of prefix 024 listed in ADMIN_PHONES) and on its own targets.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

const nextPhone = phones('024');
/** Every number this file hands out, to check none of them leaks into before/after. */
const used: string[] = [];
const phone = () => {
  const p = nextPhone();
  used.push(p);
  return p;
};

const ADMIN_PHONE = phone();

interface AuditRow {
  id: string;
  adminId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/**
 * Signs the admin in. Admin routes only need an ADMIN token today; when #23 (admin TOTP) lands,
 * the TOTP step goes here and nowhere else.
 */
async function adminLogin(t: TestApp): Promise<TestUser> {
  return t.login(ADMIN_PHONE);
}

/** No full phone number, local or international, in what the audit keeps (rule 8). */
function expectNoPhone(row: AuditRow) {
  const blob = JSON.stringify({ before: row.before ?? null, after: row.after ?? null });
  for (const p of used) expect(blob).not.toContain(p);
  expect(blob).not.toMatch(/\+225\d{8,}/);
}

describe('AdminAuditLog (#24)', () => {
  let t: TestApp;
  let admin: TestUser;
  let farmer: TestUser;
  let worker: TestUser;
  let engagementId: string;
  let units: { id: string; status: string }[];

  beforeAll(async () => {
    t = await bootApp({ ADMIN_PHONES: `+225${ADMIN_PHONE}` }, { phones: phone });
    admin = await adminLogin(t);
    ({ farmer, worker } = await t.farmerAndWorker());
    const job = await t.postJob(farmer); // DAILY, 3 days from today
    ({ engagementId } = await t.hiredOn(job, worker));
    await t.fundAndSettle(job);
    const e = await t.http().get(`/engagements/${engagementId}`).set(auth(farmer.token)).expect(200);
    units = e.body.units;
    expect(units).toHaveLength(3);
  });

  afterAll(async () => {
    await t?.close();
  });

  /** This admin's audit rows (filtered by the API, and again here so other files never count). */
  async function auditRows(filter: Record<string, string> = {}): Promise<AuditRow[]> {
    const query = { adminId: admin.id, ...filter };
    const res = await t.http().get('/admin/audit-log').query(query).set(auth(admin.token)).expect(200);
    const rows: AuditRow[] = Array.isArray(res.body) ? res.body : res.body.items;
    expect(Array.isArray(rows)).toBe(true);
    return rows.filter((r) => Object.entries(query).every(([k, v]) => (r as any)[k] === v));
  }

  /** Runs `action` and returns the audit rows it added for this admin. */
  async function added(action: () => Promise<unknown>): Promise<AuditRow[]> {
    const before = new Set((await auditRows()).map((r) => r.id));
    await action();
    const rows = (await auditRows()).filter((r) => !before.has(r.id));
    rows.forEach(expectNoPhone);
    return rows;
  }

  const unitStatus = async (unitId: string) => {
    const e = await t.http().get(`/engagements/${engagementId}`).set(auth(farmer.token)).expect(200);
    return e.body.units.find((u: { id: string }) => u.id === unitId).status;
  };

  it('logs one row when an admin resolves a dispute, with the unit before and after', async () => {
    const unit = units[1];
    await t.http().post(`/work-units/${unit.id}/dispute`).set(auth(farmer.token)).send({ reason: 'Absent le matin' }).expect(201);

    const rows = await added(() =>
      t.http().post(`/admin/work-units/${unit.id}/resolve`).set(auth(admin.token)).send({ outcome: 'RELEASE' }).expect(201));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adminId: admin.id, targetType: 'WorkUnit', targetId: unit.id });
    expect(typeof rows[0].action).toBe('string');
    expect(rows[0].createdAt).toBeDefined();
    expect(rows[0].before).toMatchObject({ status: 'DISPUTED' });
    expect(rows[0].after).toMatchObject({ status: 'RELEASED' });

    // Filtering by target finds that row only.
    const byTarget = await auditRows({ targetType: 'WorkUnit', targetId: unit.id });
    expect(byTarget.map((r) => r.id)).toEqual([rows[0].id]);
  });

  it('logs one row when an admin sets a KYC level, with the old and new level', async () => {
    const me = await t.http().get('/me').set(auth(worker.token)).expect(200);
    const was = { kycLevel: me.body.kycLevel, kycStatus: me.body.kycStatus };
    expect(was).toEqual({ kycLevel: 0, kycStatus: 'NOT_STARTED' });

    const rows = await added(() =>
      t.http().post(`/admin/users/${worker.id}/kyc`).set(auth(admin.token)).send({ level: 1, status: 'VERIFIED' }).expect(201));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adminId: admin.id, targetType: 'User', targetId: worker.id });
    expect(rows[0].before).toMatchObject(was);
    expect(rows[0].after).toMatchObject({ kycLevel: 1, kycStatus: 'VERIFIED' });
  });

  it('logs one row when an admin runs the payout batch, with its result', async () => {
    // A worker of this file with money to pay out, so the batch has something to do.
    const payee = await t.worker();
    await t.paidTask(farmer, payee, 10_000);

    let body: unknown;
    const rows = await added(async () => {
      body = (await t.http().post('/admin/payouts/run').set(auth(admin.token)).expect(201)).body;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe(admin.id);
    expect(rows[0].after).toMatchObject(body as object);
  });

  it('logs one row when an admin runs the auto-release, with its result', async () => {
    let body: unknown;
    const rows = await added(async () => {
      body = (await t.http().post('/admin/work/auto-release').set(auth(admin.token)).expect(201)).body;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe(admin.id);
    expect(rows[0].after).toMatchObject(body as object);
  });

  it('gives each admin action its own action name, usable as a filter', async () => {
    const rows = await auditRows();
    const actions = new Set(rows.map((r) => r.action));
    expect(actions.size).toBe(4); // resolve, kyc, payouts/run, auto-release

    const kyc = rows.find((r) => r.targetId === worker.id)!;
    const byAction = await auditRows({ action: kyc.action });
    expect(byAction.map((r) => r.id)).toEqual([kyc.id]);
  });

  it('writes no row when the action fails', async () => {
    // Already resolved, or never disputed: NOT_DISPUTED, nothing logged.
    const rows = await added(async () => {
      const again = await t.http().post(`/admin/work-units/${units[1].id}/resolve`).set(auth(admin.token))
        .send({ outcome: 'REFUND' }).expect(400);
      expect(again.body.code).toBe('NOT_DISPUTED');
      const pending = await t.http().post(`/admin/work-units/${units[0].id}/resolve`).set(auth(admin.token))
        .send({ outcome: 'RELEASE' }).expect(400);
      expect(pending.body.code).toBe('NOT_DISPUTED');
      // Unknown user.
      const missing = await t.http().post('/admin/users/no-such-user-024/kyc').set(auth(admin.token))
        .send({ level: 1, status: 'VERIFIED' });
      expect(missing.status).toBeGreaterThanOrEqual(400);
    });
    expect(rows).toHaveLength(0);
    expect(await auditRows({ targetId: units[0].id })).toHaveLength(0);
    expect(await auditRows({ targetId: units[1].id })).toHaveLength(1);
    expect(await auditRows({ targetId: 'no-such-user-024' })).toHaveLength(0);
  });

  it('writes the row in the action transaction: if the row cannot be written, the action is undone', async () => {
    const unit = units[2];
    await t.http().post(`/work-units/${unit.id}/dispute`).set(auth(farmer.token)).send({ reason: 'Travail non fait' }).expect(201);
    const prisma = t.app.get(PrismaService);
    const balance = async () => (await t.http().get('/me/payouts').set(auth(worker.token)).expect(200)).body.balanceXof;
    const balanceBefore = await balance();

    // Make the audit insert fail for this unit only.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION e2e_024_refuse_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW."targetId" = '${unit.id}' THEN RAISE EXCEPTION 'e2e 024: audit insert refused'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER e2e_024_refuse_audit BEFORE INSERT ON "AdminAuditLog"
        FOR EACH ROW EXECUTE FUNCTION e2e_024_refuse_audit()`);

      const rows = await added(async () => {
        const res = await t.http().post(`/admin/work-units/${unit.id}/resolve`).set(auth(admin.token)).send({ outcome: 'RELEASE' });
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
      expect(rows).toHaveLength(0);
      expect(await unitStatus(unit.id)).toBe('DISPUTED');
      expect(await balance()).toBe(balanceBefore);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS e2e_024_refuse_audit ON "AdminAuditLog"').catch(() => undefined);
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS e2e_024_refuse_audit()');
    }

    // Once the audit can be written again, the same action goes through and is logged once.
    const rows = await added(() =>
      t.http().post(`/admin/work-units/${unit.id}/resolve`).set(auth(admin.token)).send({ outcome: 'RELEASE' }).expect(201));
    expect(rows).toHaveLength(1);
    expect(await unitStatus(unit.id)).toBe('RELEASED');
  });

  it('refuses SQL UPDATE and DELETE on AdminAuditLog', async () => {
    const prisma = t.app.get(PrismaService);
    const row = (await auditRows({ targetId: worker.id }))[0];
    expect(row).toBeDefined();

    const count = async () => {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*) AS n FROM "AdminAuditLog" WHERE "id"::text = $1', row.id);
      return Number(r[0].n);
    };
    // The WHERE clause below does match the row, so a rejection comes from the guard, not a typo.
    expect(await count()).toBe(1);

    await expect(prisma.$executeRawUnsafe(
      'UPDATE "AdminAuditLog" SET "action" = \'tampered\' WHERE "id"::text = $1', row.id)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(
      'DELETE FROM "AdminAuditLog" WHERE "id"::text = $1', row.id)).rejects.toThrow();

    expect(await count()).toBe(1);
    const after = (await auditRows({ targetId: worker.id })).find((r) => r.id === row.id);
    expect(after).toEqual(row);
  });
});
