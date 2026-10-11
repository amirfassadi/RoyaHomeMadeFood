import 'dotenv/config';
import {secretPrompt} from './secret-prompt';
import {createInterface} from 'node:readline/promises';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {mobileSchema} from '../src/lib/validation/checkout';

async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const rl=createInterface({input:process.stdin,output:process.stdout});const name=(await rl.question('Admin full name: ')).trim();const mobile=mobileSchema.parse(await rl.question('Admin mobile (09…): '));rl.close();if(name.length<2||name.length>100)throw new Error('Invalid name');
 const password=await secretPrompt(),passwordHash=await hashPassword(password);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{const existing=await db.user.findUnique({where:{mobile}});if(existing)throw new Error('Account already exists; refusing to overwrite its role or password');await db.user.create({data:{name,mobile,passwordHash,role:'ADMIN',active:true}});console.log('Admin created. No password was printed or stored in source.');}finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
