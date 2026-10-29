import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../../src/app/api/contact/route';

function request(){return new Request('https://shop.example/api/contact/',{method:'POST',headers:{origin:'https://shop.example','content-type':'application/json'},body:JSON.stringify({name:'Test Customer',mobile:'09123456789',message:'A valid test message for the shop.',locale:'en',website:''})});}
function setup(globalCount:number,mobileCount=1){
 process.env.DATABASE_URL='postgresql://test';process.env.NEXT_PUBLIC_SITE_URL='https://shop.example';process.env.ROYA_DEMO_CATALOG='0';
 const keys:string[]=[];let writes=0;
 Object.assign(globalThis,{royaDb:{$queryRaw:async(_sql:unknown,key:string)=>{keys.push(key);return [{count:key==='contact:global'?globalCount:mobileCount}];},contactMessage:{create:async()=>{writes++;}}}});
 return {keys,writes:()=>writes};
}
test('exhausted shared contact cap creates no new per-phone buckets or messages',async()=>{
 const s=setup(51);
 assert.equal((await POST(request())).status,429);
 assert.deepEqual(s.keys,['contact:global']);assert.equal(s.writes(),0);
});
test('per-phone contact cap still rejects repeated submissions below the shared cap',async()=>{
 const s=setup(1,4);
 assert.equal((await POST(request())).status,429);
 assert.equal(s.keys.length,2);assert.match(s.keys[1],/^contact:mobile:[a-f0-9]{64}$/);assert.equal(s.writes(),0);
});

