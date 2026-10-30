import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {addressSchema,deleteAddressSchema} from '@/lib/customer/validation';
export const addressSelect={id:true,title:true,recipientName:true,mobile:true,zoneId:true,address:true,latitude:true,longitude:true} as const;
export function customerAddresses(userId:string){return getDb().customerAddress.findMany({where:{userId},select:addressSelect,orderBy:{createdAt:'asc'},take:20});}
export async function saveCustomerAddress(userId:string,raw:unknown){
 const {id,destination,...data}=addressSchema.parse(raw);
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:userId}});if(!user?.active||user.role!=='CUSTOMER'||!user.emailVerifiedAt)throw new ShopError('UNAUTHORIZED',401);
  if(!await tx.deliveryZone.findFirst({where:{id:data.zoneId,active:true}}))throw new ShopError('ZONE_CHANGED');
  const coordinates={latitude:destination?.lat??null,longitude:destination?.lng??null};
  if(id){const result=await tx.customerAddress.updateMany({where:{id,userId},data:{...data,...coordinates}});if(!result.count)throw new ShopError('NOT_FOUND',404);}
  else {if(await tx.customerAddress.count({where:{userId}})>=20)throw new ShopError('ADDRESS_LIMIT');await tx.customerAddress.create({data:{userId,...data,...coordinates}});}
 });
}
export async function deleteCustomerAddress(userId:string,raw:unknown){const {id}=deleteAddressSchema.parse(raw);const result=await getDb().customerAddress.deleteMany({where:{id,userId}});if(!result.count)throw new ShopError('NOT_FOUND',404);}
