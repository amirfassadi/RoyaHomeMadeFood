import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestCodeSchema,verifyCodeSchema,profileSchema} from '../src/lib/customer/validation';
import {otpDigest,otpMatches} from '../src/lib/customer/otp';
import {deploymentErrors} from '../src/lib/preflight';
test('customer signup consent is opt-in and Persian mobile/code digits normalize',()=>{
 const input=requestCodeSchema.parse({mobile:'۰۹۱۲۳۴۵۶۷۸۹',name:'مشتری رویا'});assert.equal(input.marketingSms,false);assert.equal(input.mobile,'09123456789');
 assert.equal(verifyCodeSchema.parse({challengeId:'be106b8b-1dab-4370-b9ba-e8787e43834f',code:'۰۰۱۲۳۴'}).code,'001234');
 assert(!requestCodeSchema.safeParse({...input,role:'ADMIN'}).success);assert(!profileSchema.safeParse({name:'Test',marketingSms:false,mobile:'09123456789'}).success);
});
test('OTP verifier is bound to secret, challenge and mobile',()=>{
 const secret='a'.repeat(32),id='challenge',mobile='09123456789',code='012345';const hash=otpDigest(secret,id,mobile,code);
 assert(otpMatches(hash,otpDigest(secret,id,mobile,code)));
 for(const candidate of [otpDigest('b'.repeat(32),id,mobile,code),otpDigest(secret,'different',mobile,code),otpDigest(secret,id,'09999999999',code),otpDigest(secret,id,mobile,'012346'),'bad'])assert(!otpMatches(hash,candidate));
});
test('enabling accounts requires SMS configuration without making guest checkout depend on SMS',()=>{
 const base={DATABASE_URL:'postgresql://user:pass@host/db',DIRECT_URL:'postgresql://user:pass@host/db',NEXT_PUBLIC_SITE_URL:'https://example.com',NEXTAUTH_URL:'https://example.com',NEXTAUTH_SECRET:'x'.repeat(32),CLOUDINARY_CLOUD_NAME:'cloud',CLOUDINARY_API_KEY:'key',CLOUDINARY_API_SECRET:'secret',ROYA_INDEXABLE:'0',ZARINPAL_SANDBOX:'false'};
 assert.deepEqual(deploymentErrors(base),[]);assert(deploymentErrors({...base,CUSTOMER_ACCOUNTS_ENABLED:'1'}).some(e=>e.startsWith('CUSTOMER_OTP_SECRET')));
});
