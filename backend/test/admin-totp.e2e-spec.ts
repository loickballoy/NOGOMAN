import { createHmac } from 'crypto';
import { Response } from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, phones, TestApp, TestUser } from './helpers';

/**
 * Issue #23 — TOTP second factor for admins. A stolen admin phone (SMS OTP) must not be enough:
 * every /admin/* route requires an access token in which a TOTP code was checked (`mfa: true`).
 *
 * Contract (chosen where the issue leaves it open, see the PR):
 *   POST /auth/totp/enroll   admin bearer, no body          -> 200 { secret (base32), otpauthUri }
 *   POST /auth/totp/confirm  admin bearer, { code }         -> 200 { backupCodes: string[] } (once)
 *   POST /auth/totp/verify   admin bearer, { code } or { backupCode }
 *                                                           -> 200 { accessToken } with `mfa: true`
 *   wrong / reused / out-of-window code                     -> 400 TOTP_INVALID
 *   after TOTP_MAX_ATTEMPTS wrong codes in a row            -> 429 TOTP_LOCKED, even with a good code
 *   /admin/* with a token without `mfa`                     -> 401 TOTP_REQUIRED
 *   non-admin on /auth/totp/*                               -> 403 WRONG_ROLE
 *
 * Clock tolerance: ±1 step (codes of steps s-1, s, s+1 are accepted; s±3 is refused).
 * The TOTP secret is encrypted at rest with TOTP_ENCRYPTION_KEY; backup codes are hashed.
 *
 * Never send cf-connecting-ip here: admin routes answer 404 to it (AdminAccessGuard).
 */

const phone = phones('023');

// --- RFC 6238 (TOTP), RFC 4226 (HOTP): SHA-1, 6 digits, 30 s step. ---------------------------

const STEP_SEC = 30;

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error(`base32Decode(): invalid character "${char}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

const currentStep = () => Math.floor(Date.now() / 1000 / STEP_SEC);
const totp = (secret: string, step = currentStep()) => hotp(base32Decode(secret), step);

/**
 * The current step, after waiting out the last 3 s of a step if needed, so that the step the
 * test computes is still the server's step when the request lands (no flaky boundary crossing).
 */
async function stableStep(): Promise<number> {
  const intoStep = (Date.now() / 1000) % STEP_SEC;
  if (intoStep > STEP_SEC - 3) await new Promise((r) => setTimeout(r, (STEP_SEC - intoStep + 0.2) * 1000));
  return currentStep();
}

/** A 6-digit code that matches none of the steps around `step` (certainly wrong). */
function wrongCode(secret: string, step: number): string {
  const valid = new Set([-2, -1, 0, 1, 2].map((d) => totp(secret, step + d)));
  let n = Number(totp(secret, step));
  let code: string;
  do {
    n = (n + 1) % 1_000_000;
    code = String(n).padStart(6, '0');
  } while (valid.has(code));
  return code;
}

// --- Helpers ---------------------------------------------------------------------------------

function expectApiError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual(expect.objectContaining({ statusCode: status, code }));
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.trim().length).toBeGreaterThan(0);
}

const jwtPayload = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

const e164 = (local: string) => `+225${local.replace(/\D/g, '')}`;

// One fresh admin per test: their numbers must be in ADMIN_PHONES before they first log in.
const ADMIN_COUNT = 12;
const adminNumbers = Array.from({ length: ADMIN_COUNT }, () => phone());

// Wrong codes in a row before verify locks. Set low here so the test proves the variable is read
// (the default is expected to be higher).
const TOTP_MAX_ATTEMPTS = 3;

// Fictitious 32-byte key, hex. Test-only value: never use it anywhere else.
const TOTP_ENCRYPTION_KEY = 'a3'.repeat(32);

describe('Admin TOTP (issue #23)', () => {
  let t: TestApp;
  let nextAdmin = 0;

  const newAdmin = async (): Promise<TestUser> => {
    if (nextAdmin >= adminNumbers.length) throw new Error('admin-totp: raise ADMIN_COUNT');
    return t.login(adminNumbers[nextAdmin++]);
  };

  /**
   * Enrols `admin` and confirms with the code of step `now + confirmOffset` (0 by default).
   * `step` is the server's step at confirm time.
   */
  const enrol = async (admin: TestUser, confirmOffset = 0) => {
    const enrolled = await t.http().post('/auth/totp/enroll').set(auth(admin.token)).send({}).expect(200);
    const secret: string = enrolled.body.secret;
    const step = await stableStep();
    const confirmed = await t.http().post('/auth/totp/confirm').set(auth(admin.token))
      .send({ code: totp(secret, step + confirmOffset) }).expect(200);
    return { secret, step, backupCodes: confirmed.body.backupCodes as string[], enrolled: enrolled.body };
  };

  const verify = (admin: TestUser, body: Record<string, string>) =>
    t.http().post('/auth/totp/verify').set(auth(admin.token)).send(body);

  /**
   * How many rows of the whole public schema contain `needle` (case-insensitive). Column-agnostic:
   * each row is cast to text (`row::text`), so whatever the implementation names its table or
   * column, a plaintext value would show up.
   */
  const occurrences = async (needle: string) => {
    const prisma = t.app.get(PrismaService);
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`;
    let total = 0;
    for (const { tablename } of tables) {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${tablename.replace(/"/g, '""')}" AS r WHERE r::text ILIKE $1`, pattern);
      total += n;
    }
    return total;
  };

  beforeAll(async () => {
    t = await bootApp({
      ADMIN_PHONES: ['+2250101010101', ...adminNumbers.map(e164)].join(','),
      TOTP_MAX_ATTEMPTS: String(TOTP_MAX_ATTEMPTS),
      TOTP_ENCRYPTION_KEY,
    }, { phones: phone });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('refuses /admin/disputes to an admin who has not enrolled TOTP: 401 TOTP_REQUIRED', async () => {
    const admin = await newAdmin();
    const res = await t.http().get('/admin/disputes').set(auth(admin.token));
    expectApiError(res, 401, 'TOTP_REQUIRED');
  });

  it('enrols with a secret and an otpauth:// URI, and returns backup codes once the first code is confirmed', async () => {
    const admin = await newAdmin();
    const { secret, backupCodes, enrolled } = await enrol(admin);

    expect(secret).toMatch(/^[A-Z2-7]+=*$/i);
    expect(base32Decode(secret).length).toBeGreaterThanOrEqual(10); // >= 80 bits (RFC 4226)
    expect(typeof enrolled.otpauthUri).toBe('string');
    const uri = new URL(enrolled.otpauthUri);
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(uri.searchParams.get('secret')?.toUpperCase()).toBe(secret.toUpperCase());

    expect(Array.isArray(backupCodes)).toBe(true);
    expect(backupCodes.length).toBeGreaterThanOrEqual(8);
    for (const code of backupCodes) {
      expect(typeof code).toBe('string');
      expect(code.replace(/[^0-9a-z]/gi, '').length).toBeGreaterThanOrEqual(8);
    }
    expect(new Set(backupCodes).size).toBe(backupCodes.length);
  });

  it('opens /admin/disputes with an mfa token from /auth/totp/verify, not with the plain token', async () => {
    const admin = await newAdmin();
    const { secret, step } = await enrol(admin);

    // Enrolled, but the SMS-only token is still not enough.
    expectApiError(await t.http().get('/admin/disputes').set(auth(admin.token)), 401, 'TOTP_REQUIRED');

    // Next step's code: within the ±1 step tolerance, and not a replay of the code confirm used.
    const verified = await t.http().post('/auth/totp/verify').set(auth(admin.token))
      .send({ code: totp(secret, step + 1) }).expect(200);
    const mfaToken: string = verified.body.accessToken;
    expect(typeof mfaToken).toBe('string');

    const claims = jwtPayload(mfaToken);
    const plain = jwtPayload(admin.token);
    expect(claims.mfa).toBe(true);
    expect(claims.sub).toBe(admin.id);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(plain.exp - plain.iat); // short-lived

    await t.http().get('/admin/disputes').set(auth(mfaToken)).expect(200);
  });

  it('accepts a backup code once, then refuses it', async () => {
    const admin = await newAdmin();
    const { backupCodes } = await enrol(admin);
    const backupCode = backupCodes[0];

    const first = await t.http().post('/auth/totp/verify').set(auth(admin.token)).send({ backupCode }).expect(200);
    expect(jwtPayload(first.body.accessToken).mfa).toBe(true);
    await t.http().get('/admin/disputes').set(auth(first.body.accessToken)).expect(200);

    const second = await t.http().post('/auth/totp/verify').set(auth(admin.token)).send({ backupCode });
    expectApiError(second, 400, 'TOTP_INVALID');
  });

  it('does not store backup codes in clear text', async () => {
    const admin = await newAdmin();
    const { backupCodes } = await enrol(admin);

    // The search does find what is stored: this admin's id is in at least their own user row.
    expect(await occurrences(admin.id)).toBeGreaterThan(0);

    for (const code of backupCodes) {
      expect(await occurrences(code)).toBe(0);
      const bare = code.replace(/[^0-9a-z]/gi, ''); // e.g. "ABCD-EFGH" stored as "abcdefgh"
      if (bare !== code) expect(await occurrences(bare)).toBe(0);
    }
  });

  it('does not store the TOTP secret in clear text (encrypted at rest)', async () => {
    const admin = await newAdmin();
    const { secret } = await enrol(admin);
    const key = base32Decode(secret);

    expect(await occurrences(admin.id)).toBeGreaterThan(0); // the search does read the database
    // Neither the base32 form returned by enroll, nor the raw key in hex or base64.
    expect(await occurrences(secret.replace(/=+$/, ''))).toBe(0);
    expect(await occurrences(key.toString('hex'))).toBe(0);
    expect(await occurrences(key.toString('base64').replace(/=+$/, ''))).toBe(0);
  });

  it('accepts codes one step off (s-1, s+1) and refuses codes three steps off (s±3): 400 TOTP_INVALID', async () => {
    const admin = await newAdmin();
    // s-1 is checked on confirm: on verify, it would follow the code confirm consumed, and an
    // implementation that only accepts steps after the last one used may rightly refuse it.
    const { secret, step } = await enrol(admin, -1);

    const next = await verify(admin, { code: totp(secret, step + 1) }).expect(200);
    expect(jwtPayload(next.body.accessToken).mfa).toBe(true);

    expectApiError(await verify(admin, { code: totp(secret, step + 3) }), 400, 'TOTP_INVALID');
    expectApiError(await verify(admin, { code: totp(secret, step - 3) }), 400, 'TOTP_INVALID');
  });

  it('refuses a TOTP code already accepted by verify: 400 TOTP_INVALID', async () => {
    const admin = await newAdmin();
    const { secret, step } = await enrol(admin);
    const code = totp(secret, step + 1);

    await verify(admin, { code }).expect(200);
    expectApiError(await verify(admin, { code }), 400, 'TOTP_INVALID');
  });

  it(`locks verify after TOTP_MAX_ATTEMPTS (${TOTP_MAX_ATTEMPTS}) wrong codes in a row: 429 TOTP_LOCKED, even with a good code`, async () => {
    // One wrong code short of the limit: a good code still opens.
    const below = await newAdmin();
    const b = await enrol(below);
    for (let i = 0; i < TOTP_MAX_ATTEMPTS - 1; i++) {
      expectApiError(await verify(below, { code: wrongCode(b.secret, b.step) }), 400, 'TOTP_INVALID');
    }
    await verify(below, { code: totp(b.secret, b.step + 1) }).expect(200);

    // At the limit: the good code is refused.
    const locked = await newAdmin();
    const l = await enrol(locked);
    for (let i = 0; i < TOTP_MAX_ATTEMPTS - 1; i++) {
      expectApiError(await verify(locked, { code: wrongCode(l.secret, l.step) }), 400, 'TOTP_INVALID');
    }
    // The last wrong code may already answer "locked"; either way it is refused.
    const last = await verify(locked, { code: wrongCode(l.secret, l.step) });
    expect([400, 429]).toContain(last.status);
    expect(['TOTP_INVALID', 'TOTP_LOCKED']).toContain(last.body.code);

    expectApiError(await verify(locked, { code: totp(l.secret, l.step + 1) }), 429, 'TOTP_LOCKED');
  });

  it('does not let a non-admin enrol: 403 WRONG_ROLE', async () => {
    const farmer = await t.farmer();
    const res = await t.http().post('/auth/totp/enroll').set(auth(farmer.token)).send({});
    expectApiError(res, 403, 'WRONG_ROLE');
  });
});
