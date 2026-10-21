#!/usr/bin/env node
// Operator-only diagnostics: no password reset, account changes or product writes.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {pathToFileURL} from 'node:url';

export class ProbeError extends Error {}
export function inspectionSql(mobile){
 if(!/^09\d{9}$/.test(mobile))throw new ProbeError('Invalid mobile; no database query was made.');
 const digest=createHash('sha256').update(mobile).digest('hex');
 // Only validated digits and a hex digest are interpolated into this read-only query.
 return `BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT json_build_object(
 'account',(SELECT json_build_object('active',"active",'role',"role",'twoFactorEnabled',"twoFactorEnabled",'passwordFormatValid',COALESCE("passwordHash" ~ '^scrypt\\$32768\\$8\\$1\\$[a-f0-9]{32}\\$[a-f0-9]{128}$',false)) FROM public."User" WHERE "mobile"='${mobile}'),
 'limits',(SELECT COALESCE(json_agg(json_build_object('scope',x.scope,'remaining',CASE WHEN b."expiresAt">NOW() THEN GREATEST(x.max-b."count",0) ELSE x.max END,'retrySeconds',CASE WHEN b."expiresAt">NOW() AND b."count">=x.max THEN CEIL(EXTRACT(EPOCH FROM b."expiresAt"-NOW()))::int ELSE 0 END)),'[]'::json) FROM (VALUES ('account','admin-login:${digest}',5),('global','admin-login:global',60)) AS x(scope,key,max) LEFT JOIN public."RateLimitBucket" b ON b."key"=x.key)
);
COMMIT;`;
}
const knownErrors=new Set(['CredentialsSignin','AccessDenied','Configuration','Verification','OAuthSignin','OAuthCallback','SessionRequired']);
export async function probeLogin({base,origin,mobile,password,emit=console.log}){
 const cookies=new Map();let authenticated=false,stage='health';
 async function request(path,init={}){
  const headers=new Headers(init.headers);
  if(cookies.size)headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
  let response;
  try{response=await fetch(base+path,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{throw new ProbeError(`${stage}: request failed or timed out.`);}
  for(const cookie of response.headers.getSetCookie()){
   const pair=cookie.split(';',1)[0],index=pair.indexOf('=');
   if(index<1)continue;
   const key=pair.slice(0,index),value=pair.slice(index+1);
   if(value)cookies.set(key,value);else cookies.delete(key);
  }
  return response;
 }
 async function expect(response,status=200){
  emit(`AUTH ${stage}: HTTP ${response.status}`);
  if(response.status!==status){
   let code='';
   // Never print the body, callback URL, cookie, token or entered credentials.
   if(stage==='credentials'){
    try{const body=await response.json();const error=new URL(body.url).searchParams.get('error');if(knownErrors.has(error))code=` (${error})`;}catch{}
   }
   throw new ProbeError(`${stage}: expected HTTP ${status}, received ${response.status}${code}.`);
  }
  return response;
 }
 async function json(response){
  await expect(response);
  try{return await response.json();}catch{throw new ProbeError(`${stage}: invalid JSON response.`);}
 }
 async function auth(action,values={}){
  const previous=stage;stage=action==='signout'?'logout-csrf':'csrf';
  const csrf=await json(await request('/api/auth/csrf/'));
  if(typeof csrf.csrfToken!=='string')throw new ProbeError(`${stage}: CSRF token missing.`);
  stage=previous;
  return request('/api/auth/'+action+'/',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,csrfToken:csrf.csrfToken,callbackUrl:origin+'/admin/',json:'true'})});
 }
 try{
  await json(await request('/api/health/'));
  stage='guest-guard';await expect(await request('/api/admin/data/?section=products'),401);
  stage='credentials';await json(await auth('callback/credentials',{mobile,password}));password=undefined;
  stage='session';const session=await json(await request('/api/auth/session/'));
  if(typeof session.adminId!=='string'||!session.adminId)throw new ProbeError('session: administrator identity missing.');
  authenticated=true;
  stage='admin-page';await expect(await request('/admin/products/'));
  stage='admin-api';await expect(await request('/api/admin/data/?section=products'));
 }finally{
  password=undefined;
  const hasSession=[...cookies.keys()].some(key=>key.includes('next-auth.session-token'));
  if(authenticated||hasSession){
   const previous=stage;
   try{
    stage='logout';await json(await auth('signout'));
    stage='logout-guard';await expect(await request('/api/admin/data/?section=products'),401);
   }catch{throw new ProbeError(`${previous}: logout verification failed; no product writes were attempted.`);}
  }
  cookies.clear();
 }
 emit('ADMIN LOGIN PASS: credentials, session, administrator page/API and logout verified. No product, account or setting was changed.');
}

function privileged(args,input){
 try{return execFileSync('sudo',['-n',...args],{encoding:'utf8',input,stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:1024*1024});}
 catch{throw new ProbeError('Local inspection failed. Run sudo -v in this SSH terminal, then retry the diagnostic.');}
}
async function main(){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new ProbeError('Run interactively in the VPS SSH terminal.');
 privileged(['systemctl','is-active','--quiet','roya-preview.service']);
 const pid=privileged(['systemctl','show','--property=MainPID','--value','roya-preview.service']).trim();
 if(!/^[1-9]\d*$/.test(pid))throw new ProbeError('Private preview process not found.');
 const raw=privileged(['cat',`/proc/${pid}/environ`]);
 const env=Object.fromEntries(raw.split('\0').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return [pair.slice(0,i),pair.slice(i+1)];}));
 const release=privileged(['cat','/opt/roya/preview-current/.roya-release']).trim();
 if(!/^[a-f0-9]{40}$/.test(release))throw new ProbeError('Private preview release marker is invalid.');
 console.log('Preview release: '+release);
 const checks={
  loopback:env.HOSTNAME==='127.0.0.1'&&env.PORT==='3311',
  standalone:env.ROYA_DEPLOYMENT_ROLE==='standalone',
  authOrigin:env.NEXTAUTH_URL==='http://localhost:3311',
  siteOrigin:env.NEXT_PUBLIC_SITE_URL==='http://localhost:3311',
  authSecret:typeof env.NEXTAUTH_SECRET==='string'&&env.NEXTAUTH_SECRET.length>=32,
  privateEffects:['ROYA_LIVE_PAYMENTS','ROYA_ACCEPT_ORDERS','ROYA_SEND_SMS','ROYA_INDEXABLE'].every(key=>env[key]==='0'),
  database:false,
 };
 try{
  const u=new URL(env.DATABASE_URL);
  checks.database=u.protocol==='postgresql:'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.pathname==='/roya_store'&&u.username==='roya_app'&&!!u.password;
 }catch{}
 for(const [name,valid] of Object.entries(checks))console.log(`CONFIG ${name}: ${valid?'OK':'FAIL'}`);
 // Runtime credentials stay in memory and are never included in process arguments/output.
 for(const key of Object.keys(env))delete env[key];
 if(Object.values(checks).some(valid=>!valid))throw new ProbeError('Runtime configuration needs review; no login attempted.');
 const listeners=privileged(['ss','-H','-lnt','sport = :3311']).trim().split('\n').filter(Boolean);
 if(listeners.length!==1||listeners[0].split(/\s+/)[3]!=='127.0.0.1:3311')throw new ProbeError('Expected a loopback-only preview listener; no login attempted.');

 let muted=false,password;
 const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const terminal=createInterface({input:process.stdin,output,terminal:true});
 try{
  const mobile=(await terminal.question('موبایل مدیر: ')).trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0));
  if(!/^09\d{9}$/.test(mobile))throw new ProbeError('Mobile must contain 11 digits starting with 09. No login attempted.');
  const text=privileged(['-u','postgres','/usr/lib/postgresql/18/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','roya_store'],inspectionSql(mobile));
  let state;try{state=JSON.parse(text.trim());}catch{throw new ProbeError('Account inspection returned an invalid result. No login attempted.');}
  const a=state.account;
  console.log('ACCOUNT '+JSON.stringify(a??{exists:false}));
  for(const limit of state.limits)console.log(`LIMIT ${limit.scope}: remaining=${limit.remaining}, retrySeconds=${limit.retrySeconds}`);
  if(!a||!a.active||a.role!=='ADMIN'||a.twoFactorEnabled||!a.passwordFormatValid)throw new ProbeError('Account is not eligible for password login; no account changes or login attempts were made.');
  if(state.limits.some(limit=>limit.remaining<1))throw new ProbeError('Login limit is active. Wait for the reported retrySeconds; limits were not reset and no login was attempted.');
  if(process.argv.slice(2).includes('--check-only')){console.log('ADMIN PREFLIGHT PASS: account, runtime and limits are eligible. Password was not tested.');return;}
  process.stdout.write('رمز عبور مدیر (پنهان، فقط یک تلاش): ');muted=true;
  password=await terminal.question('');muted=false;process.stdout.write('\n');
  if(!password||password.length>128)throw new ProbeError('Password length is invalid; no login attempted.');
  // An IP transport with the configured localhost Origin mirrors the VPS tester.
  await probeLogin({base:'http://127.0.0.1:3311',origin:'http://localhost:3311',mobile,password});
 }finally{password=undefined;muted=false;terminal.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error('ADMIN DIAGNOSTIC STOPPED: '+(error instanceof ProbeError?error.message:'Diagnostic failed; no secret details were printed.'));process.exitCode=1;});
}
