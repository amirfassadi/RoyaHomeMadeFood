import 'dotenv/config';
import {secretPrompt} from './secret-prompt';
import {createInterface} from 'node:readline/promises';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {mobileSchema} from '../src/lib/validation/checkout';

async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 if(!process.stdin.isTTY)throw new Error('Use an interactive terminal to create an administrator');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 let name='',mobile='';
 try{
  while(true){
   name=(await rl.question('Admin full name: ')).trim();
   if(name.length>=2&&name.length<=100)break;
   console.error('Enter a name containing 2–100 characters.');
  }
  while(true){
   const result=mobileSchema.safeParse(await rl.question('Admin mobile (11 digits, starting with 09): '));
   if(result.success){mobile=result.data;break;}
   console.error('Enter the complete 11-digit Iranian mobile number, starting with 09.');
  }
 }finally{rl.close();}
 const password=await secretPrompt(),passwordHash=await hashPassword(password);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{const existing=await db.user.findUnique({where:{mobile}});if(existing)throw new Error('Account already exists; refusing to overwrite its role or password');await db.user.create({data:{name,mobile,passwordHash,role:'ADMIN',adminOwner:true,active:true}});console.log('Admin created. No password was printed or stored in source.');}finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
