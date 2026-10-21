import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,renameSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {PrivateAdminClient,PricingTestError,checkedJson,runPricingAdminTest} from './private-pricing-test';

async function main(){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new PricingTestError('Run interactively in the VPS SSH terminal.');
 const read=(...args:string[])=>execFileSync('sudo',['-n',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const receipt=JSON.parse(read('cat','/var/lib/roya/admin-backup-receipt.json'));
 const expected=JSON.parse(readFileSync('deploy/private-preview-manifest.json','utf8')).release_id;
 const release=read('cat','/opt/roya/preview-current/.roya-release');
 const age=Date.now()-Date.parse(receipt.createdAt);
 if(receipt.database!=='roya_store'||receipt.restoreVerified!==true||receipt.release!==release||release!==expected||receipt.previewEnvSha256!==read('sha256sum','/etc/roya/preview.env').split(/\s/)[0]||receipt.databaseEnvSha256!==read('sha256sum','/etc/roya/database.env').split(/\s/)[0]||!Number.isFinite(age)||age< -60000||age>2*3600000)throw new PricingTestError('A fresh verified backup matching this private preview is required.');
 const record=join(mkdtempSync(join(homedir(),'roya-setup/pricing-check.')),'policy-recovery.json');
 let muted=false,password:string|undefined,mobile='';
 const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stdout.write(chunk);done();}});
 const terminal=createInterface({input:process.stdin,output,terminal:true});
 try{
  mobile=(await terminal.question('موبایل مدیر: ')).trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0));
  if(!/^09\d{9}$/.test(mobile))throw new PricingTestError('Invalid administrator mobile.');
  process.stdout.write('رمز جدید مدیر (پنهان): ');muted=true;password=await terminal.question('');
 }finally{muted=false;terminal.close();process.stdout.write('\n');}
 if(!password||password.length>128)throw new PricingTestError('Invalid password length; no login attempted.');
 const admin=new PrivateAdminClient('http://127.0.0.1:3311','http://localhost:3311'),guest=new PrivateAdminClient('http://127.0.0.1:3311','http://localhost:3311');
 try{
  await checkedJson(await admin.auth('callback/credentials',{mobile,password}),'credentials');password=undefined;
  const session=await checkedJson(await admin.request('/api/auth/session/'),'session');
  if(typeof session.adminId!=='string')throw new PricingTestError('Administrator session missing.');
  console.log('Private policy recovery record: '+record);
  await runPricingAdminTest({admin,guest,checkpoint:value=>{
   writeFileSync(record+'.new',JSON.stringify({release,createdAt:new Date().toISOString(),...value},null,2)+'\n',{mode:0o600});renameSync(record+'.new',record);
  }});
  console.log('PRICING VPS PASS: shared policy and restoration verified on the private VPS preview.');
 }finally{
  password=undefined;
  if([...admin.cookies.keys()].some(k=>k.includes('next-auth.session-token'))){
   await checkedJson(await admin.auth('signout'),'logout');
   await checkedJson(await admin.request('/api/admin/data/?section=settings'),'logout-guard',401);
  }
  admin.cookies.clear();guest.cookies.clear();
 }
}
void main().catch(error=>{console.error('PRICING TEST STOPPED: '+(error instanceof Error?error.message:'Unknown failure.'));process.exitCode=1;});
