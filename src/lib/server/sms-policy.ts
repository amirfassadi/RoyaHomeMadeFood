import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {smsPolicySchema} from '@/lib/validation/sms-policy';
import {ShopError} from './shop-http';
export async function smsEnabled(db:Pick<Prisma.TransactionClient,'setting'>=getDb()){
 const row=await db.setting.findUnique({where:{key:'sms-policy'}});
 if(!row)return true;
 const result=smsPolicySchema.safeParse(row.value);
 if(!result.success)throw new ShopError('UNAVAILABLE',503);
 return result.data.enabled;
}
