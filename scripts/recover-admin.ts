import 'dotenv/config';
import {createInterface} from 'node:readline/promises';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {mobileSchema} from '../src/lib/validation/checkout';
import {secretPrompt} from './secret-prompt';
async function main(){
 if(!process.env.DATABASE_URL||!process.stdin.isTTY)throw new Error('Use an interactive trusted server terminal with DATABASE_URL configured');
 const rl=createInterface({input:process.stdin,output:process.stdout});const mobile=mobileSchema.parse(await rl.question('Existing admin mobile: '));const confirm=await rl.question('This revokes all admin sessions. Type RESET to proceed: ');rl.close();if(confirm!=='RESET')throw new Error('Cancelled');
 const password=await secretPrompt('New password (12–128 characters, hidden): ');if(password!==await secretPrompt('Confirm new password (hidden): '))throw new Error('Passwords do not match');
 const passwordHash=await hashPassword(password),db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "mobile"=${mobile} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{mobile}});if(!user||user.role!=='ADMIN'||!user.active||user.twoFactorEnabled)throw new Error('Recovery requires an existing active admin without unsupported 2FA');
  await tx.user.update({where:{id:user.id},data:{passwordHash,mustChangePassword:false,sessionVersion:{increment:1}}});await tx.adminAudit.create({data:{adminId:user.id,action:'ADMIN_PASSWORD_RECOVERED',targetId:user.id}});
 });console.log('Password recovered. Old sessions revoked. No password was printed.');}finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Recovery failed or was cancelled. Check input and database access; no account role or active state was changed.');process.exitCode=1;});
