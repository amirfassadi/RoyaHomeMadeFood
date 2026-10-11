import 'dotenv/config';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{const result=await db.rateLimitBucket.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-86400000)}}});console.log(`Removed ${result.count} expired rate-limit buckets.`);}finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Rate-limit cleanup failed; inspect database connectivity.');process.exitCode=1;});
