import { PrismaClient } from '@prisma/client';

/** How long the transaction holding the lock may stay open: the longest a locked task may run. */
export const ADVISORY_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export type AdvisoryLockOutcome<T> = { ran: false } | { ran: true; result: T };

/**
 * Runs `fn` only if no other instance is running a task under the same `name` (rule 7).
 *
 * Opens an interactive transaction and takes `pg_try_advisory_xact_lock(hashtext(name))` in it:
 * - lock already held elsewhere: returns `{ ran: false }` at once, without waiting and without calling `fn`;
 * - lock obtained: awaits `fn()` and returns `{ ran: true, result }`.
 * The lock belongs to the transaction, so PostgreSQL releases it when the transaction ends, whether
 * `fn` resolves, throws (the error is rethrown unchanged) or the process dies and its connection drops.
 *
 * `fn` takes no arguments: its queries go through the regular client, outside the transaction that
 * holds the lock. They are not rolled back if `fn` fails, and each running task keeps one extra pool
 * connection busy for the lock. If `fn` runs longer than ADVISORY_LOCK_TIMEOUT_MS, Prisma closes the
 * transaction, the lock is released while `fn` is still running and the call rejects once `fn` ends:
 * keep locked tasks well under that limit.
 */
export async function withAdvisoryLock<T>(
  prisma: PrismaClient,
  name: string,
  fn: () => Promise<T>,
): Promise<AdvisoryLockOutcome<T>> {
  return prisma.$transaction(
    async (tx): Promise<AdvisoryLockOutcome<T>> => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`;
      if (!locked) return { ran: false };
      return { ran: true, result: await fn() };
    },
    { timeout: ADVISORY_LOCK_TIMEOUT_MS, maxWait: 10_000 },
  );
}
