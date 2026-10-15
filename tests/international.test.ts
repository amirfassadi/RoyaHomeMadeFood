import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {usdCents,decimalUsd,foreignCountry} from '../src/lib/international';
import {validWebhook,amountMatches,safeCheckoutUrl} from '../src/lib/crypto-invoice';
import {internationalCheckoutSchema,domesticCheckoutSchema} from '../src/lib/validation/checkout';
test('USD totals round up once using integer arithmetic and reject invalid amounts',()=>{
 assert.equal(usdCents(120001,100000),121);assert.equal(usdCents(120000,100000),120);assert.equal(decimalUsd(121),'1.21');assert.throws(()=>usdCents(0,100000));assert.throws(()=>usdCents(120000,0));
 assert(amountMatches('1.21000000',121));assert(!amountMatches('1.210001',121));assert(!amountMatches('1e2',10000));assert(!amountMatches('1.22',121));
});
test('country detection fails closed without an explicitly trusted proxy',()=>{
 const h=new Headers({'x-roya-country':'US'});assert.equal(foreignCountry(h,false),null);assert.equal(foreignCountry(h,true),'US');for(const v of ['IR','XX','T1','','ZZ']){h.set('x-roya-country',v);assert.equal(foreignCountry(h,true),null);}assert.equal(foreignCountry(new Headers(),true),null);
});
test('webhook HMAC covers exact bytes and checkout redirects cannot leave the configured gateway',()=>{
 const raw=Buffer.from('{"invoiceId":"test"}'),secret='test-only-secret',sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');assert(validWebhook(raw,sig,secret));assert(!validWebhook(Buffer.from(raw.toString()+' '),sig,secret));assert(!validWebhook(raw,null,secret));assert(!validWebhook(raw,'sha256=00',secret));
 assert.equal(safeCheckoutUrl('https://gateway.example/i/test','https://gateway.example'),'https://gateway.example/i/test');assert.equal(safeCheckoutUrl('https://evil.example/i/test','https://gateway.example'),null);assert.equal(safeCheckoutUrl('https://user:pass@gateway.example/i/test','https://gateway.example'),null);
});
test('international checkout requires a buyer email and USD amount and cannot use the domestic endpoint',()=>{
 const data={items:[{productId:'test',quantity:1}],zoneId:'test',name:'Recipient',mobile:'09123456789',address:'Recipient address in Iran',locale:'fa',paymentMethod:'BTCPAY',buyerEmail:'buyer@example.com',expectedUsdCents:121,expectedTotal:120001,idempotencyKey:'123e4567-e89b-42d3-a456-426614174000'};
 assert(internationalCheckoutSchema.safeParse(data).success);assert(!domesticCheckoutSchema.safeParse(data).success);assert(!internationalCheckoutSchema.safeParse({...data,buyerEmail:'bad'}).success);assert(!internationalCheckoutSchema.safeParse({...data,expectedUsdCents:undefined}).success);assert(!internationalCheckoutSchema.safeParse({...data,mobile:'+441234567890'}).success);
});
