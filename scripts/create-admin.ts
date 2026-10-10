import 'dotenv/config';
import {createInterface} from 'node:readline/promises';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {mobileSchema} from '../src/lib/validation/checkout';
async function secretPrompt(){
 if(!process.stdin.isTTY)throw new Error('Use an interactive terminal; passwords are not accepted as command arguments');
 process.stdout.write('Password (12–128 characters, hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise<string>((resolve,reject)=>{let value='';const listener=(chunk:Buffer)=>{for(const char of chunk.toString('utf8')){
  if(char==='\u0003'){cleanup();reject(new Error('Cancelled'));return;}
  if(char==='\r'||char==='\n'){cleanup();resolve(value);return;}
  if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ' && value.length<129)value+=char;
 }};function cleanup(){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}process.stdin.on('data',listener);});
}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const rl=createInterface({input:process.stdin,output:process.stdout});const name=(await rl.question('Admin full name: ')).trim();const mobile=mobileSchema.parse(await rl.question('Admin mobile (09…): '));rl.close();if(name.length<2||name.length>100)throw new Error('Invalid name');
 const password=await secretPrompt(),passwordHash=await hashPassword(password);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{const existing=await db.user.findUnique({where:{mobile}});if(existing)throw new Error('Account already exists; refusing to overwrite its role or password');await db.user.create({data:{name,mobile,passwordHash,role:'ADMIN',active:true}});console.log('Admin created. No password was printed or stored in source.');}finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
