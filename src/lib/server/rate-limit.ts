import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';

type Bucket={key:string;limit:number;windowSeconds:number};
class LimitExceeded extends Error {
  constructor(public retryAfter:number){super('RATE_LIMIT');}
}
async function consume(db:Pick<Prisma.TransactionClient,'$queryRaw'>,{key,limit,windowSeconds}:Bucket){
  const rows=await db.$queryRaw<{count:number;retryAfter:number}[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, clock_timestamp() + (${windowSeconds} * INTERVAL '1 second'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= clock_timestamp() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + (${windowSeconds} * INTERVAL '1 second') ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::int AS "retryAfter";
  `;
  return {allowed:rows[0].count<=limit,retryAfter:rows[0].retryAfter??windowSeconds};
}
// A single atomic upsert; concurrent requests share limits across server instances.
export async function consumeRateLimit(key:string,limit:number,windowSeconds:number){
  return (await consume(getDb(),{key,limit,windowSeconds})).allowed;
}
// Reserve all send quotas together. A rejected request consumes none of them.
// Stable row-lock ordering prevents deadlocks between concurrent reservations.
export async function consumeRateLimits(buckets:Bucket[]):Promise<{allowed:boolean;retryAfter:number}>{
  try{
    return await getDb().$transaction(async tx=>{
      let retryAfter=0;
      for(const bucket of [...buckets].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)){
        const result=await consume(tx,bucket);
        if(!result.allowed)retryAfter=Math.max(retryAfter,result.retryAfter);
      }
      if(retryAfter)throw new LimitExceeded(retryAfter);
      return {allowed:true,retryAfter:0};
    });
  }catch(error){
    if(error instanceof LimitExceeded)return {allowed:false,retryAfter:error.retryAfter};
    throw error;
  }
}
