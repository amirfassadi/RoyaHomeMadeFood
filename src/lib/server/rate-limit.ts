import 'server-only';
import {getDb} from './db';
// A single atomic upsert; concurrent requests share limits across server instances.
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await getDb().$queryRaw<{count: number}[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, NOW() + (${windowSeconds} * INTERVAL '1 second'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN NOW() + (${windowSeconds} * INTERVAL '1 second') ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count";
  `;
  return rows[0].count <= limit;
}
