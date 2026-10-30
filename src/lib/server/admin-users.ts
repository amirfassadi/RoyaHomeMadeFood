import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {hashPassword} from '@/lib/admin/password';
import {createAdminSchema,updateAdminSchema} from '@/lib/validation/admin-users';
import {audit} from './admin-products';
const select={id:true,name:true,mobile:true,email:true,active:true,adminOwner:true,adminPermissions:true,mustChangePassword:true,sessionVersion:true,createdAt:true} as const;
export async function listAdminUsers(){return getDb().user.findMany({where:{role:'ADMIN'},select,orderBy:{createdAt:'asc'},take:200});}
async function owner(tx:Pick<ReturnType<typeof getDb>,'user'>,id:string,version:number){const actor=await tx.user.findUnique({where:{id}});if(!actor?.active||actor.role!=='ADMIN'||!actor.adminOwner||actor.mustChangePassword||actor.sessionVersion!==version)throw new ShopError('FORBIDDEN',403);}
export async function createAdminUser(actorId:string,sessionVersion:number,raw:unknown){
 const input=createAdminSchema.parse(raw),passwordHash=await hashPassword(input.temporaryPassword),db=getDb();
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-users',0))::text`;
  await owner(tx,actorId,sessionVersion);
  const where=input.identifier.includes('@')?{email:input.identifier}:{mobile:input.identifier};
  const existing=await tx.user.findUnique({where});
  if(existing?.role==='ADMIN'||existing?.twoFactorEnabled||existing&&!existing.active)throw new ShopError('ACCOUNT_EXISTS',409);
  const data={name:input.name,passwordHash,role:'ADMIN' as const,adminPermissions:input.permissions,adminOwner:false,mustChangePassword:true};
  const saved=existing?await tx.user.update({where:{id:existing.id},data:{...data,sessionVersion:{increment:1}},select}):await tx.user.create({data:{...data,...where},select});
  await audit(tx,actorId,existing?'ADMIN_PROMOTED':'ADMIN_CREATED',saved.id);return saved;
 });
}
export async function updateAdminUser(actorId:string,sessionVersion:number,raw:unknown){
 const input=updateAdminSchema.parse(raw),passwordHash=input.temporaryPassword?await hashPassword(input.temporaryPassword):null;
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-users',0))::text`;
  await owner(tx,actorId,sessionVersion);
  const target=await tx.user.findUnique({where:{id:input.id}});
  if(!target||target.role!=='ADMIN')throw new ShopError('NOT_FOUND',404);
  if(target.adminOwner||target.id===actorId)throw new ShopError('OWNER_PROTECTED',403);
  if(target.sessionVersion!==input.expectedSessionVersion)throw new ShopError('CONFLICT',409);
  const saved=await tx.user.update({where:{id:target.id},data:{active:input.active,adminPermissions:input.permissions,sessionVersion:{increment:1},...(passwordHash?{passwordHash,mustChangePassword:true}:{})},select});
  await audit(tx,actorId,passwordHash?'ADMIN_PASSWORD_RESET':'ADMIN_ACCESS_CHANGED',saved.id);return saved;
 });
}
