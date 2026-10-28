import { auth, bootApp, phones, TestApp } from './helpers';

interface Reply {
  status: number;
  body: { code?: string; accessToken?: string };
}

/**
 * Issue #103 — the OTP attempt counter must be atomic: parallel guesses on one code never
 * get more than OTP_MAX_ATTEMPTS evaluations. Black box, through the HTTP API.
 */

const MAX = 5; // OTP_MAX_ATTEMPTS default
const PARALLEL = 40; // 40 + 1 + 3 + 5 requests stay under OTP_VERIFY_PER_IP_MINUTE (50)

describe('OTP attempts are counted atomically (issue #103)', () => {
  const phone = phones('103');
  let t: TestApp;

  beforeAll(async () => {
    t = await bootApp({ OTP_MAX_ATTEMPTS: String(MAX) }, { phones: phone });
  });
  afterAll(() => t.close());

  /**
   * supertest serialises requests on the in-memory server; a listening socket and fetch send
   * them truly in parallel, which is what an attacker does.
   */
  let baseUrl: string;
  beforeAll(async () => {
    await t.app.listen(0, '127.0.0.1');
    baseUrl = await t.app.getUrl();
  });
  async function verify(number: string, code: string): Promise<Reply> {
    const res = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: number, code }),
    });
    return { status: res.status, body: (await res.json()) as Reply['body'] };
  }

  /** Requests a code for a fresh number and returns it as texted. */
  async function requestCode(number: string): Promise<string> {
    await t.http().post('/auth/otp/request').send({ phone: number }).expect(200);
    const to = `+225${number.replace(/\D/g, '')}`;
    return t.sms.lastTo(to)!.match(/(\d{6})/)![1];
  }

  const wrongOf = (code: string, i: number) => String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0');

  it(`evaluates at most ${MAX} of ${PARALLEL} parallel wrong guesses, then refuses even the right code`, async () => {
    const number = phone();
    const code = await requestCode(number);

    const guesses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => verify(number, wrongOf(code, i))),
    );

    const codes = guesses.map((r) => r.body.code);
    expect(guesses.every((r) => r.status === 400)).toBe(true);
    expect(codes.filter((c) => c === 'OTP_INVALID')).toHaveLength(MAX);
    expect(codes.filter((c) => c === 'OTP_TOO_MANY_ATTEMPTS')).toHaveLength(PARALLEL - MAX);

    const right = await verify(number, code);
    expect(right.status).toBe(400);
    expect(right.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('lets only one of several parallel requests with the right code log in', async () => {
    const number = phone();
    const code = await requestCode(number);

    const results = await Promise.all(
      Array.from({ length: 3 }, () => verify(number, code)),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const winner = results.find((r) => r.status === 200)!;
    await t.http().get('/me').set(auth(winner.body.accessToken!)).expect(200);
    for (const r of results.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(400);
      expect(['OTP_EXPIRED', 'OTP_TOO_MANY_ATTEMPTS']).toContain(r.body.code);
    }
  });

  it('still accepts the right code after fewer than the maximum wrong guesses', async () => {
    const number = phone();
    const code = await requestCode(number);
    for (let i = 0; i < MAX - 1; i++) {
      const res = await t.http().post('/auth/otp/verify').send({ phone: number, code: wrongOf(code, i) });
      expect(res.body.code).toBe('OTP_INVALID');
    }
    await t.http().post('/auth/otp/verify').send({ phone: number, code }).expect(200);
  });
});
