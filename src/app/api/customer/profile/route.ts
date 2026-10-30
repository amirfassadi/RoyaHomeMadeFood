import {smsEnabled} from '@/lib/server/sms-policy';
import {customerAddresses} from '@/lib/server/customer-addresses';
import {customerLoginEnabled,customerRegistrationEnabled} from '@/lib/server/customer-otp';
import {optionalCustomer} from '@/lib/server/customer-session';
import {getDb} from '@/lib/server/db';
import {profileSchema,consentVersion} from '@/lib/customer/validation';
import {readShopBody,json,failure,ShopError} from '@/lib/server/shop-http';
export async function POST(request:Request){try{
 const input=await readShopBody(request,profileSchema,'customer-profile',2048),user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);
 await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
  const current=await tx.user.findUnique({where:{id:user.id}});if(!current?.active||current.role!=='CUSTOMER'||current.sessionVersion!==user.sessionVersion)throw new ShopError('UNAUTHORIZED',401);
  if(current.marketingSms!==input.marketingSms)await tx.marketingConsentEvent.create({data:{userId:user.id,allowed:input.marketingSms,policyVersion:consentVersion,source:'account-settings'}});
  if(input.marketingEmail!==undefined&&current.marketingEmail!==input.marketingEmail)await tx.marketingConsentEvent.create({data:{userId:user.id,allowed:input.marketingEmail,policyVersion:'email-news-v1',source:'account-settings'}});
  await tx.user.update({where:{id:user.id},data:input});
 });return json({saved:true});
}catch(e){return failure(e);}}

export async function GET(){try{const user=await optionalCustomer();return json({loginEnabled:customerLoginEnabled(),registrationEnabled:(await customerRegistrationEnabled())&&await smsEnabled(),customer:user?{name:user.name,mobile:user.mobile,email:user.email,addresses:await customerAddresses(user.id)}:null});}catch(e){return failure(e);}}
