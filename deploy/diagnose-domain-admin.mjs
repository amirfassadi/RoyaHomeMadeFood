#!/usr/bin/env node
// Operator diagnostic. No installation, data edits, reset, order, payment or SMS.
import {request as httpsRequest} from 'node:https';
import {execFileSync} from 'node:child_process';
import {readFileSync,statfsSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {inspectionSql,probeLogin,ProbeError} from './diagnose-vps-admin.mjs';

export const ORIGIN='https://royahealthyfood.ir';
const RELEASES=['bd69388bdfea903b892ad2a5430be8382c0fe012','26b04f0f882a811604b720aa069660e7c58201ed','3f6a74cef79ac602d6b9f34f57eca7ed0989a54d','8f272a29a383ccc64b88964eea7e7dde0bd9db39','321f8929648c9fcf2bdcfda3e270352b0b9d2174','e13824b5061e745a4e4ac28bf8e7a9e128f3a3f1'];

export function secureCookies(headers){
 for(const text of headers.getSetCookie()){
  const parts=text.split(';').map(s=>s.trim()),name=parts.shift().split('=',1)[0];
  if(!name.includes('next-auth.'))continue;
  const flags=new Map(parts.map(s=>{const i=s.indexOf('=');return i<0?[s.toLowerCase(),'']:[s.slice(0,i).toLowerCase(),s.slice(i+1)];}));
  if(!name.startsWith('__Host-')&&!name.startsWith('__Secure-'))throw new ProbeError('HTTPS cookie prefix is missing.');
  if(!flags.has('secure')||!flags.has('httponly')||flags.get('path')!=='/'||flags.has('domain')||flags.get('samesite')?.toLowerCase()!=='lax')throw new ProbeError('HTTPS cookie attributes are invalid.');
 }
}

// Fixed HTTPS hostname and SNI, local Nginx transport, normal certificate validation.
// Optional port/CA are used only by isolated native tests, never by the operator CLI.
export function domainTransport({password,port=443,ca}={}){
 const authorization=password===undefined?undefined:'Basic '+Buffer.from('roya-preview:'+password).toString('base64');
 return (address,init={})=>new Promise((resolve,reject)=>{
  const url=new URL(address);
  if(url.origin!==ORIGIN||url.username||url.password)return reject(new ProbeError('Unexpected diagnostic destination.'));
  const headers=Object.fromEntries(new Headers(init.headers));
  if(headers.authorization)return reject(new ProbeError('Unexpected authorization override.'));
  headers.host=url.hostname;if(authorization)headers.authorization=authorization;
  const req=httpsRequest({host:'127.0.0.1',port,servername:url.hostname,path:url.pathname+url.search,method:init.method??'GET',headers,ca,signal:init.signal,timeout:15000},res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)req.destroy(new Error('limit'));else chunks.push(chunk);});
   res.on('end',()=>{
    try{
     const responseHeaders=new Headers();
     for(let i=0;i<res.rawHeaders.length;i+=2)responseHeaders.append(res.rawHeaders[i],res.rawHeaders[i+1]);
     secureCookies(responseHeaders);
     resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:responseHeaders}));
    }catch(error){reject(error instanceof ProbeError?error:new ProbeError('Invalid HTTPS response.'));}
   });
   res.on('error',()=>reject(new ProbeError('HTTPS response did not complete.')));
  });
  req.on('timeout',()=>req.destroy(new Error('timeout')));
  req.on('error',()=>reject(new ProbeError('HTTPS connection or trusted certificate verification failed.')));
  req.end(init.body instanceof URLSearchParams?init.body.toString():init.body);
 });
}

export async function domainAccessMode(send=domainTransport()){
 const health=await send(ORIGIN+'/api/health/',{signal:AbortSignal.timeout(15000)});
 const marker=health.headers.get('x-roya-domain-stage');
 let mode;
 if(health.status===401&&marker==='private-app-v1'&&health.headers.get('www-authenticate')==='Basic realm="Roya private preview"')mode='private';
 else if(health.status===200&&marker==='public-preview-v1'&&!health.headers.get('www-authenticate')&&health.headers.get('x-robots-tag')?.includes('noindex')){
  try{if((await health.json()).status!=='ok')throw new Error();}catch{throw new ProbeError('Unexpected test-preview health response; no login attempted.');}
  mode='public-preview';
 }else throw new ProbeError('Unrecognized domain access mode; no login attempted.');
 const catalog=await send(ORIGIN+'/fa/catalog/',{signal:AbortSignal.timeout(15000)});
 if(catalog.status!==(mode==='private'?401:200)||catalog.headers.get('x-roya-domain-stage')!==marker)throw new ProbeError('Domain access checks disagree; no login attempted.');
 if(mode==='public-preview'){
  const guard=await send(ORIGIN+'/api/admin/data/?section=settings',{signal:AbortSignal.timeout(15000)});
  if(guard.status!==401||guard.headers.get('www-authenticate'))throw new ProbeError('Administrator guest guard differs; no login attempted.');
 }
 return mode;
}

function privileged(args,input){
 try{return execFileSync('sudo',['-n',...args],{encoding:'utf8',input,stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:2*1024*1024});}
 catch{throw new ProbeError('Local inspection failed. Run sudo -v, then retry. Private command details omitted.');}
}
export function inspectRuntime(){
 for(const unit of ['roya-preview.service','nginx.service']){
  privileged(['systemctl','is-active','--quiet',unit]);
  privileged(['systemctl','is-enabled','--quiet',unit]);
  console.log('SERVICE '+unit+': active, enabled');
 }
 privileged(['nginx','-t']);console.log('NGINX syntax: PASS');
 const release=privileged(['cat','/opt/roya/preview-current/.roya-release']).trim();
 if(!RELEASES.includes(release))throw new ProbeError('Unexpected installed release; no login attempted.');
 console.log('Preview release: '+release);
 const pid=privileged(['systemctl','show','--property=MainPID','--value','roya-preview.service']).trim();
 if(!/^[1-9]\d*$/.test(pid))throw new ProbeError('Preview process not found.');
 const env=Object.fromEntries(privileged(['cat',`/proc/${pid}/environ`]).split('\0').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return [pair.slice(0,i),pair.slice(i+1)];}));
 const expected={HOSTNAME:'127.0.0.1',PORT:'3311',ROYA_DEPLOYMENT_ROLE:'standalone',ROYA_PRIVATE_DB_CATALOG:'1',ROYA_DEMO_CATALOG:'1',NEXTAUTH_URL:ORIGIN,NEXT_PUBLIC_SITE_URL:ORIGIN,ROYA_INDEXABLE:'0',ROYA_LIVE_PAYMENTS:'0',ROYA_ACCEPT_ORDERS:'0',ROYA_SEND_SMS:'0',ROYA_INTERNATIONAL_ENABLED:'0',CUSTOMER_ACCOUNTS_ENABLED:'0',ROYA_TRUST_GEO_HEADER:'0',ROYA_PREVIEW_RELEASE:release};
 let valid=Object.entries(expected).every(([key,value])=>env[key]===value)&&env.NEXTAUTH_SECRET?.length>=32;
 try{const u=new URL(env.DATABASE_URL);valid&&=u.protocol==='postgresql:'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.pathname==='/roya_store'&&u.username==='roya_app'&&!!u.password;}catch{valid=false;}
 valid&&=!['SITES_STATIC_PREVIEW','NEXTAUTH_URL_INTERNAL','ROYA_BACKEND_URL'].some(key=>env[key]);
 for(const key of Object.keys(env))delete env[key];
 if(!valid)throw new ProbeError('Private HTTPS runtime configuration differs; no login attempted.');
 for(const port of [3311,3312]){
  const lines=privileged(['ss','-H','-lnt','sport = :'+port]).trim().split('\n').filter(Boolean);
  if(port===3311?(lines.length!==1||lines[0].split(/\s+/)[3]!=='127.0.0.1:3311'):lines.length!==0)throw new ProbeError('Unexpected application listener; no login attempted.');
 }
 console.log('CONFIG HTTPS origin, loopback and disabled live effects: PASS');
 const disk=statfsSync('/opt/roya'),available=readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+) kB$/m);
 console.log('RESOURCES diskAvailableMiB='+Math.floor(disk.bavail*disk.bsize/1048576)+', memoryAvailableMiB='+(available?Math.floor(Number(available[1])/1024):'unknown'));
 console.log('STATUS scope: service/configuration snapshot only; backup scheduling, log retention and long-term stability are not certified.');
}
async function expect(send,path,status){
 const response=await send(ORIGIN+path,{signal:AbortSignal.timeout(15000)});
 console.log('HTTPS '+path+': HTTP '+response.status);
 if(response.status!==status)throw new ProbeError('Unexpected HTTPS status; no login attempted.');
 return response;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.some(arg=>arg!=='--status-only'))throw new ProbeError('Only --status-only is supported. Do not pass credentials as arguments.');
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new ProbeError('Run interactively in the VPS SSH terminal.');
 inspectRuntime();
 const anonymous=domainTransport();
 const mode=await domainAccessMode(anonymous);console.log('ACCESS MODE: '+mode);
 if(args.includes('--status-only')){console.log('DOMAIN STATUS PASS: access mode and trusted HTTPS verified locally. No administrator login attempted.');return;}
 let muted=false,password,send=anonymous;
 const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const terminal=createInterface({input:process.stdin,output,terminal:true});
 async function secret(prompt){process.stdout.write(prompt);muted=true;try{return await terminal.question('');}finally{muted=false;process.stdout.write('\n');}}
 try{
  if(mode==='private'){
   password=await secret('Existing private-preview password (hidden; not administrator): ');
   if(!/^[!-~]{12,128}$/.test(password))throw new ProbeError('Private password format invalid; no authenticated request attempted.');
   send=domainTransport({password});password=undefined;
  }
  await expect(send,'/api/health/',200);
  for(const path of ['/fa/catalog/','/en/catalog/','/fa/rates/','/en/rates/','/api/shop/catalog/','/api/shop/pricing/'])await expect(send,path,200);
  const mobile=(await terminal.question('موبایل مدیر: ')).trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0));
  const text=privileged(['-u','postgres','/usr/lib/postgresql/18/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','roya_store'],inspectionSql(mobile));
  let state;try{state=JSON.parse(text.trim());}catch{throw new ProbeError('Account inspection invalid; no login attempted.');}
  const a=state.account;
  console.log('ACCOUNT eligible: '+!!(a?.active&&a.role==='ADMIN'&&!a.twoFactorEnabled&&a.passwordFormatValid));
  for(const limit of state.limits)console.log(`LIMIT ${limit.scope}: remaining=${limit.remaining}, retrySeconds=${limit.retrySeconds}`);
  if(!a?.active||a.role!=='ADMIN'||a.twoFactorEnabled||!a.passwordFormatValid||state.limits.some(limit=>limit.remaining<1))throw new ProbeError('Account or rate limit not eligible. No login attempted or limits reset.');
  password=await secret('رمز عبور مدیر (پنهان، فقط یک تلاش): ');
  if(!password||password.length>128)throw new ProbeError('Administrator password length invalid; no login attempted.');
  await probeLogin({base:ORIGIN,origin:ORIGIN,mobile,password,send,settings:true});
  console.log('DOMAIN ADMIN PASS: actual HTTPS access mode, credentials, secure cookies, products/settings read and logout. No product or pricing changes; no order, payment or SMS. Browser layout and external connectivity remain separate tests.');
 }finally{password=undefined;send=undefined;muted=false;terminal.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error('DOMAIN DIAGNOSTIC STOPPED: '+(error instanceof ProbeError?error.message:'Diagnostic failed; private details omitted.'));process.exitCode=1;});
}
