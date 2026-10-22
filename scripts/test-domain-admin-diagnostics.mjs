import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ORIGIN,domainTransport,secureCookies} from '../deploy/diagnose-domain-admin.mjs';
import {probeLogin} from '../deploy/diagnose-vps-admin.mjs';

async function fixture(action,wrongName=false){
 const root=mkdtempSync(join(tmpdir(),'roya-domain-diagnostic-'));
 let server;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=diagnostic-test','-addext','subjectAltName=DNS:'+(wrongName?'wrong.invalid':'royahealthyfood.ir'),'-keyout',join(root,'key.pem'),'-out',join(root,'cert.pem')],{stdio:'ignore'});
  const ca=readFileSync(join(root,'cert.pem')),calls=[];
  let authenticated=false;
  const cookie='__Secure-next-auth.session-token=fixture-session';
  const authorization='Basic '+Buffer.from('roya-preview:fixture-private-password').toString('base64');
  server=createServer({key:readFileSync(join(root,'key.pem')),cert:ca},async(req,res)=>{
   let body='';for await(const part of req)body+=part;
   calls.push({path:req.url,method:req.method});
   res.setHeader('content-type','application/json');
   const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
   if(req.headers.authorization!==authorization)return reply(401,{});
   assert.equal(req.headers.host,'royahealthyfood.ir');
   const path=req.url.split('?')[0];
   if(path==='/api/health/')return reply(200,{ok:true});
   if(path==='/redirect/') {res.setHeader('location','https://wrong.invalid/');return reply(302,{});}
   if(path==='/unsafe-cookie/') {res.setHeader('set-cookie','__Secure-next-auth.session-token=hidden; Path=/; HttpOnly; SameSite=Lax');return reply(200,{});}
   if(path==='/api/auth/csrf/'){
    res.setHeader('set-cookie','__Host-next-auth.csrf-token=fixture-csrf; Path=/; Secure; HttpOnly; SameSite=Lax');
    return reply(200,{csrfToken:'fixture-csrf'});
   }
   if(path==='/api/auth/callback/credentials/'){
    assert.equal(req.headers.origin,ORIGIN);
    assert.equal(new URLSearchParams(body).get('password'),'fixture-admin-password');
    assert.equal(new URLSearchParams(body).get('csrfToken'),'fixture-csrf');
    authenticated=true;res.setHeader('set-cookie',cookie+'; Path=/; Secure; HttpOnly; SameSite=Lax');return reply(200,{});
   }
   if(path==='/api/auth/session/')return reply(200,authenticated?{adminId:'fixture'}:{});
   if(path==='/admin/products/')return reply(authenticated?200:307,{});
   if(path==='/api/admin/data/'){
    if(authenticated)assert.ok(req.headers.cookie?.includes(cookie));
    return reply(authenticated?200:401,{});
   }
   if(path==='/api/auth/signout/'){
    assert.equal(req.headers.origin,ORIGIN);authenticated=false;
    res.setHeader('set-cookie','__Secure-next-auth.session-token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');return reply(200,{});
   }
   return reply(404,{});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const options={port:server.address().port,ca};
  await action({options,calls,isAuthenticated:()=>authenticated});
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  rmSync(root,{recursive:true,force:true});
 }
}
test('private HTTPS probe uses fixed SNI, secure cookies, settings read, one login and verified logout',async()=>fixture(async({options,calls,isAuthenticated})=>{
 const output=[],send=domainTransport({...options,password:'fixture-private-password'});
 const anonymous=await domainTransport(options)(ORIGIN+'/api/health/');assert.equal(anonymous.status,401);
 await probeLogin({base:ORIGIN,origin:ORIGIN,mobile:'09120000000',password:'fixture-admin-password',send,settings:true,emit:line=>output.push(line)});
 assert.ok(output.includes('AUTH admin-settings: HTTP 200'));
 assert.ok(output.includes('AUTH logout-guard: HTTP 401'));
 assert.equal(isAuthenticated(),false);
 assert.equal(calls.filter(x=>x.path==='/api/auth/callback/credentials/').length,1);
 assert.ok(calls.some(x=>x.path==='/api/admin/data/?section=settings'));
 assert.ok(!calls.some(x=>x.method==='POST'&&!x.path.startsWith('/api/auth/')));
 assert.ok(!JSON.stringify(output).includes('fixture-admin-password'));
 assert.ok(!JSON.stringify(output).includes('fixture-private-password'));
 assert.ok(!JSON.stringify(output).includes('fixture-session'));
}));
test('TLS transport preserves default trust, rejects a mismatched name and does not follow redirects',async()=>{
 await fixture(async({options})=>{
  await assert.rejects(domainTransport({port:options.port})(ORIGIN+'/'),/trusted certificate/);
  const response=await domainTransport({...options,password:'fixture-private-password'})(ORIGIN+'/redirect/');assert.equal(response.status,302);
 });
 await fixture(async({options})=>assert.rejects(domainTransport(options)(ORIGIN+'/'),/trusted certificate/),true);
});
test('TLS transport rejects unsafe destinations, authorization overrides and insecure authentication cookies',async()=>fixture(async({options})=>{
 const send=domainTransport({...options,password:'fixture-private-password'});
 await assert.rejects(send('https://wrong.invalid/'),/destination/);
 await assert.rejects(send('https://someone:password@royahealthyfood.ir/'),/destination/);
 await assert.rejects(send(ORIGIN+'/',{headers:{authorization:'hidden'}}),/override/);
 await assert.rejects(send(ORIGIN+'/unsafe-cookie/'),/cookie attributes/);
}));
test('cookie checks reject absent secure prefix, Domain, missing HttpOnly and SameSite overrides',()=>{
 for(const text of ['next-auth.session-token=hidden; Path=/; Secure; HttpOnly; SameSite=Lax','__Secure-next-auth.session-token=hidden; Path=/; Secure; HttpOnly; SameSite=Lax; Domain=royahealthyfood.ir','__Secure-next-auth.session-token=hidden; Path=/; Secure; SameSite=Lax','__Secure-next-auth.session-token=hidden; Path=/; Secure; HttpOnly; SameSite=None']){
  assert.throws(()=>secureCookies(new Headers({'set-cookie':text})),/cookie/);
 }
});
