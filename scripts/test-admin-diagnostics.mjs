import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {inspectionSql,probeLogin} from '../deploy/diagnose-vps-admin.mjs';

async function exercise(failure){
 const calls=[],output=[];
 const secret='never-print-this-password',token='never-print-this-session';
 let loggedIn=false;
 const server=createServer(async(req,res)=>{
  let text='';for await(const part of req)text+=part;
  const path=req.url.split('?')[0];calls.push(path);
  res.setHeader('content-type','application/json');
  function reply(status,body){res.statusCode=status;res.end(JSON.stringify(body));}
  if(path==='/api/health/')return reply(200,{ok:true});
  if(path==='/api/auth/csrf/')return reply(failure==='csrf'?401:200,{csrfToken:token});
  if(path==='/api/auth/callback/credentials/'){
   assert.equal(req.headers.origin,'http://localhost:3311');
   assert.equal(new URLSearchParams(text).get('password'),secret);
   if(failure==='credentials')return reply(401,{url:`http://localhost:3311/admin/login/?error=CredentialsSignin&token=${token}&password=${secret}`});
   loggedIn=true;res.setHeader('set-cookie',`next-auth.session-token=${token}; Path=/; HttpOnly`);return reply(200,{url:'http://localhost:3311/admin/'});
  }
  if(path==='/api/auth/session/')return reply(200,failure==='session'?{}:{adminId:'fixture-admin'});
  if(path==='/admin/products/')return reply(200,{});
  if(path==='/api/admin/data/'){
   if(loggedIn)assert.equal(req.headers.cookie,`next-auth.session-token=${token}`);
   return reply(loggedIn&&failure!=='admin-api'?200:401,{});
  }
  if(path==='/api/auth/signout/'){
   loggedIn=false;res.setHeader('set-cookie','next-auth.session-token=; Path=/; Max-Age=0');return reply(200,{});
  }
  return reply(404,{});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let error;
 try{await probeLogin({base:`http://127.0.0.1:${server.address().port}`,origin:'http://localhost:3311',mobile:'09120000000',password:secret,emit:line=>output.push(line)});}
 catch(e){error=e;}
 finally{await new Promise(resolve=>server.close(resolve));}
 const report=output.join('\n')+(error?.message??'');
 assert.ok(!report.includes(secret));assert.ok(!report.includes(token));
 assert.ok(!calls.includes('/api/admin/products/'));
 assert.equal(calls.filter(x=>x==='/api/auth/callback/credentials/').length,failure==='csrf'?0:1);
 return {calls,output,error};
}
test('login probe reports the credential boundary, redacts secrets and never retries',async()=>{
 const {error,calls}=await exercise('credentials');
 assert.match(error.message,/credentials: expected HTTP 200, received 401 \(CredentialsSignin\)/);
 assert.ok(!calls.includes('/api/auth/session/'));
});
test('a CSRF failure is distinguished from rejected credentials',async()=>{
 const {error}=await exercise('csrf');assert.match(error.message,/csrf: expected HTTP 200, received 401/);
});
test('a missing administrator session signs out the partial session',async()=>{
 const {error,calls}=await exercise('session');assert.match(error.message,/session: administrator identity missing/);
 assert.ok(calls.includes('/api/auth/signout/'));
});
test('an administrator API failure is distinguished from login failure',async()=>{
 const {error,calls}=await exercise('admin-api');assert.match(error.message,/admin-api: expected HTTP 200, received 401/);
 assert.ok(calls.includes('/api/auth/signout/'));
});
test('successful probe verifies logout and performs no product writes',async()=>{
 const {error,output}=await exercise();assert.equal(error,undefined);
 assert.ok(output.at(-1).startsWith('ADMIN LOGIN PASS:'));
 assert.ok(output.includes('AUTH logout-guard: HTTP 401'));
});
test('inspection rejects unvalidated mobile values before forming SQL',()=>{
 assert.throws(()=>inspectionSql("0912'; DROP TABLE x;--"),/Invalid mobile/);
});
test('PostgreSQL inspection reports account flags and preserves an exhausted limiter',{skip:!process.env.ROYA_INTEGRATION_DATABASE_URL},async()=>{
 const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
 assert.ok(['/roya_test','/roya_integration_test'].includes(new URL(url).pathname));
 const {default:pg}=await import('pg');
 const db=new pg.Client({connectionString:url});await db.connect();
 const id=randomUUID(),mobile='09'+String(randomBytes(4).readUInt32BE()%1e9).padStart(9,'0');
 const key='admin-login:'+createHash('sha256').update(mobile).digest('hex');
 const hash='scrypt$32768$8$1$'+'a'.repeat(32)+'$'+'b'.repeat(128);
 try{
  await db.query('INSERT INTO "User" (id,name,mobile,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',[id,'Diagnostic integration fixture',mobile,hash,'ADMIN']);
  await db.query('INSERT INTO "RateLimitBucket" (key,count,"expiresAt") VALUES ($1,5,NOW()+INTERVAL \'10 minutes\')',[key]);
  const results=await db.query(inspectionSql(mobile));
  const state=results.find(result=>result.command==='SELECT').rows[0].json_build_object;
  assert.deepEqual(state.account,{active:true,role:'ADMIN',twoFactorEnabled:false,passwordFormatValid:true});
  const limit=state.limits.find(limit=>limit.scope==='account');assert.equal(limit.remaining,0);assert.ok(limit.retrySeconds>0);
  assert.equal((await db.query('SELECT count FROM "RateLimitBucket" WHERE key=$1',[key])).rows[0].count,5);
  assert.ok(!JSON.stringify(state).includes(hash));
 }finally{
  await db.query('ROLLBACK');
  await db.query('DELETE FROM "RateLimitBucket" WHERE key=$1',[key]);
  await db.query('DELETE FROM "User" WHERE id=$1 AND mobile=$2',[id,mobile]);
  await db.end();
 }
});
