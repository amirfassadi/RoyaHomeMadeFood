#!/usr/bin/env node
// Interactive operator test. Passwords are accepted only through the terminal.
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {probeProducts} from './private-product-probe.mjs';
import {ORIGIN,domainTransport,inspectRuntime} from './diagnose-domain-admin.mjs';

const args=process.argv.slice(2);
if(args.some(arg=>!['--catalog','--domain'].includes(arg)))throw new Error('Only --catalog and --domain are supported.');
const domain=args.includes('--domain'),catalogTest=args.includes('--catalog');
const base=domain?ORIGIN:'http://127.0.0.1:3311',origin=domain?ORIGIN:'http://localhost:3311';
if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Run interactively in your SSH terminal.');
if(domain)inspectRuntime();
const receipt=JSON.parse(execFileSync('sudo',['-n','cat','/var/lib/roya/admin-backup-receipt.json'],{encoding:'utf8'}));
const current=execFileSync('sudo',['-n','cat','/opt/roya/preview-current/.roya-release'],{encoding:'utf8'}).trim();
const envDigest=execFileSync('sudo',['-n','sha256sum','/etc/roya/preview.env'],{encoding:'utf8'}).split(/\s/)[0];
const databaseDigest=execFileSync('sudo',['-n','sha256sum','/etc/roya/database.env'],{encoding:'utf8'}).split(/\s/)[0];
const age=Date.now()-Date.parse(receipt.createdAt);
if(receipt.database!=='roya_store'||receipt.restoreVerified!==true||receipt.release!==current||receipt.previewEnvSha256!==envDigest||receipt.databaseEnvSha256!==databaseDigest||!Number.isFinite(age)||age< -60000||age>2*3600000)throw new Error('A fresh verified backup for this exact private preview is required.');
let muted=false,password,send=fetch;
const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const terminal=createInterface({input:process.stdin,output,terminal:true});
async function secret(prompt){process.stdout.write(prompt);muted=true;try{return await terminal.question('');}finally{muted=false;process.stdout.write('\n');}}
try{
 if(domain){
  const anonymous=await domainTransport()(ORIGIN+'/api/health/',{signal:AbortSignal.timeout(15000)});
  if(anonymous.status!==401)throw new Error('Private gate did not deny anonymous access; no product writes attempted.');
  password=await secret('Existing private-preview password (hidden; not administrator): ');
  if(!/^[!-~]{12,128}$/.test(password))throw new Error('Private password format invalid; no product writes attempted.');
  send=domainTransport({password});password=undefined;
  const health=await send(ORIGIN+'/api/health/',{signal:AbortSignal.timeout(15000)});
  if(health.status!==200)throw new Error('Private gate rejected access; no administrator login attempted.');
 }
 const mobile=(await terminal.question('موبایل مدیر: ')).trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0));
 password=await secret('رمز عبور مدیر (پنهان): ');
 if(!/^09\d{9}$/.test(mobile)||!password||password.length>128)throw new Error('Administrator credentials were not entered correctly.');
 const result=await probeProducts({base,origin,mobile,password,catalogTest,send});
 if(!result.passed)process.exitCode=1;
 else if(domain)console.log('DOMAIN PRODUCT PASS: actual HTTPS product, price, stock, capacity and archive verified; no order, payment or SMS.');
}finally{password=undefined;send=undefined;muted=false;terminal.close();}
