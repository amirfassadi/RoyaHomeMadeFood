import 'server-only';
import {PrismaClient} from '@/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as {royaDb?: PrismaClient};
export function getDb(): PrismaClient {
  if (globalDb.royaDb) return globalDb.royaDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for database operations');
  const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
  globalDb.royaDb = db;
  return db;
}
