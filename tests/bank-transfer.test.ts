import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bankTransferSettingsSchema} from '../src/lib/validation/bank-transfer';
import {CheckoutRequestError,canEditAfterCheckoutFailure} from '../src/lib/domain/checkout-request';
const account={id:'00000000-0000-4000-8000-000000000001',holder:'Test holder',card:'6037 0000 0000 0000',iban:'',active:true};
test('multiple bank accounts normalize digits and reject malformed or duplicate destinations',()=>{
 const result=bankTransferSettingsSchema.parse({enabled:true,accounts:[{...account,card:'۶۰۳۷-۰۰۰۰-۰۰۰۰-۰۰۰۰'},{...account,id:'00000000-0000-4000-8000-000000000002',card:'',iban:'ir'+'0'.repeat(24)}]});
 assert.equal(result.accounts[0].card,'6037000000000000');assert.equal(result.accounts[1].iban,'IR'+'0'.repeat(24));
 assert.equal(bankTransferSettingsSchema.safeParse({enabled:true,accounts:[]}).success,false);
 assert.equal(bankTransferSettingsSchema.safeParse({enabled:true,accounts:[{...account,active:false}]}).success,false);
 assert.equal(bankTransferSettingsSchema.safeParse({enabled:true,accounts:[{...account,card:'',iban:''}]}).success,false);
 assert.equal(bankTransferSettingsSchema.safeParse({enabled:true,accounts:[account,{...account,id:'00000000-0000-4000-8000-000000000002'}]}).success,false);
 assert.equal(bankTransferSettingsSchema.safeParse({enabled:true,accounts:[{...account,iban:'IR123'}]}).success,false);
});
test('only explicit server confirmation releases checkout fields after a failed request',()=>{
 assert.equal(canEditAfterCheckoutFailure(new CheckoutRequestError('BANK_TRANSFER_UNAVAILABLE',true)),true);
 assert.equal(canEditAfterCheckoutFailure(new CheckoutRequestError('UNAVAILABLE')),false);
 assert.equal(canEditAfterCheckoutFailure(new Error('BANK_TRANSFER_UNAVAILABLE')),false);
 assert.equal(canEditAfterCheckoutFailure(new TypeError('Failed to fetch')),false);
});
