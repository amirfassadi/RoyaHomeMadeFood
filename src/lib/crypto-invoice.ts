import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export const invoiceSchema=z.object({id:z.string().min(1).max(100),amount:z.union([z.string(),z.number().finite()]).transform(String),currency:z.string(),status:z.string(),additionalStatus:z.string(),checkoutLink:z.url(),metadata:z.object({orderId:z.string(),royaPaymentId:z.string()})});
export function validWebhook(raw:Uint8Array,signature:string|null,secret:string){
 if(!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected=`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`;
 return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
export function amountMatches(value:string,cents:number){
 if(!/^\d{1,12}(\.\d{1,8})?$/.test(value))return false;
 const [whole,fraction='']=value.split('.');
 if(/[1-9]/.test(fraction.slice(2)))return false;
 return BigInt(whole)*100n+BigInt(fraction.slice(0,2).padEnd(2,'0'))===BigInt(cents);
}
export function safeCheckoutUrl(value:string,origin:string){try{const url=new URL(value);return url.origin===origin&&!url.username&&!url.password?url.toString():null;}catch{return null;}}
