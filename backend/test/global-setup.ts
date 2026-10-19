import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

/** Brings the throwaway test database to the latest schema and empties it. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://nogoman@127.0.0.1:5433/nogoman_test';
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against ${url}: the database name must end with _test`);
  }
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
}
