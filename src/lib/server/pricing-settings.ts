import 'server-only';
import {Prisma} from '@/generated/prisma/client';
import {defaultPricingPolicy,pricingPolicySchema,pricingPolicyEditSchema,type PricingPolicy,type PricingPolicyEdit} from '@/lib/pricing';
import {getDb} from './db';
import {isDemoAdmin} from './admin-mode';
import {ShopError} from './shop-http';

export const PRICING_SETTINGS_KEY='international-pricing';
export async function getPricingPolicy():Promise<PricingPolicy>{
  if(isDemoAdmin())return {...defaultPricingPolicy,countryFees:{}};
  const row=await getDb().setting.findUnique({where:{key:PRICING_SETTINGS_KEY}});
  if(!row)return {...defaultPricingPolicy,countryFees:{}};
  const result=pricingPolicySchema.safeParse(row.value);
  if(!result.success)throw new ShopError('PRICING_UNAVAILABLE',503);
  return {...result.data,updatedAt:row.updatedAt.toISOString()};
}

export async function savePricingPolicy(raw:PricingPolicyEdit,adminId:string):Promise<PricingPolicy>{
  const input=pricingPolicyEditSchema.parse(raw);
  const previous=new Date(input.expectedUpdatedAt);
  const updatedAt=new Date(Math.max(Date.now(),previous.getTime()+1));
  const value={...input.policy,updatedAt:updatedAt.toISOString()};
  try{
    return await getDb().$transaction(async tx=>{
      if(input.expectedUpdatedAt===defaultPricingPolicy.updatedAt){
        await tx.setting.create({data:{key:PRICING_SETTINGS_KEY,value,updatedAt}});
      }else{
        const changed=await tx.setting.updateMany({where:{key:PRICING_SETTINGS_KEY,updatedAt:previous},data:{value,updatedAt}});
        if(changed.count!==1)throw new ShopError('CONFLICT',409);
      }
      await tx.adminAudit.create({data:{adminId,action:'PRICING_SETTINGS',targetId:PRICING_SETTINGS_KEY}});
      return value;
    });
  }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ShopError('CONFLICT',409);
    throw error;
  }
}
