import { Injectable } from '@nestjs/common';
import { JournalKind, LedgerAccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface AccountRef {
  code: string;
  type: LedgerAccountType;
  userId?: string;
  jobId?: string;
}

export interface PostingLine {
  account: AccountRef;
  /** Positive = credit (money held for / owed to this account), negative = debit. */
  amountXof: number;
}

export const Accounts = {
  clearing: (provider: string): AccountRef => ({ code: `clearing:${provider}`, type: 'PROVIDER_CLEARING' }),
  escrow: (jobId: string): AccountRef => ({ code: `escrow:job:${jobId}`, type: 'ESCROW', jobId }),
  payable: (userId: string): AccountRef => ({ code: `payable:user:${userId}`, type: 'USER_PAYABLE', userId }),
  revenue: (): AccountRef => ({ code: 'revenue:platform', type: 'PLATFORM_REVENUE' }),
};

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a balanced journal entry. Re-posting the same idempotency key is a no-op
   * that returns the original entry, so callers can safely retry.
   */
  async post(tx: Tx, kind: JournalKind, idempotencyKey: string, lines: PostingLine[], memo?: string) {
    const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const nonZero = lines.filter((l) => l.amountXof !== 0);
    if (nonZero.length < 2) throw new Error(`journal entry ${idempotencyKey} needs at least two non-zero lines`);
    for (const l of nonZero) {
      if (!Number.isSafeInteger(l.amountXof)) throw new Error(`non-integer amount in ${idempotencyKey}`);
    }
    const sum = nonZero.reduce((s, l) => s + l.amountXof, 0);
    if (sum !== 0) throw new Error(`journal entry ${idempotencyKey} is unbalanced by ${sum}`);

    const entry = await tx.journalEntry.create({ data: { kind, idempotencyKey, memo } });
    for (const line of nonZero) {
      const account = await this.ensureAccount(tx, line.account);
      await tx.posting.create({ data: { entryId: entry.id, accountId: account.id, amountXof: line.amountXof } });
    }
    return entry;
  }

  async balance(code: string, tx: Tx | PrismaService = this.prisma): Promise<number> {
    const res = await tx.posting.aggregate({ where: { account: { code } }, _sum: { amountXof: true } });
    return res._sum.amountXof ?? 0;
  }

  /** Sum over every account; always zero if the books are consistent. */
  async trialBalance(): Promise<{ total: number; byType: Record<string, number> }> {
    const rows = await this.prisma.$queryRaw<{ type: string; total: bigint }[]>`
      SELECT a."type"::text AS type, COALESCE(SUM(p."amountXof"), 0)::bigint AS total
      FROM "LedgerAccount" a LEFT JOIN "Posting" p ON p."accountId" = a."id"
      GROUP BY a."type"`;
    const byType: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byType[r.type] = Number(r.total);
      total += Number(r.total);
    }
    return { total, byType };
  }

  private async ensureAccount(tx: Tx, ref: AccountRef) {
    return tx.ledgerAccount.upsert({
      where: { code: ref.code },
      update: {},
      create: { code: ref.code, type: ref.type, userId: ref.userId, jobId: ref.jobId },
    });
  }
}
