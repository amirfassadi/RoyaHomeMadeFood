import 'server-only';
import {z} from 'zod';
import {foreignCountry,usdCents} from '@/lib/international';
import {ShopError} from './shop-http';
const configSchema=z.object({url:z.url(),store:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),key:z.string().min(16),secret:z.string().min(32),rate:z.coerce.number().int().positive().max(2147483647),expires:z.iso.datetime(),site:z.url()});
export function cryptoConfig(requireFreshRate=true){
 const parsed=configSchema.safeParse({url:process.env.BTCPAY_URL,store:process.env.BTCPAY_STORE_ID,key:process.env.BTCPAY_API_KEY,secret:process.env.BTCPAY_WEBHOOK_SECRET,rate:process.env.ROYA_USD_RATE_TOMAN,expires:process.env.ROYA_USD_RATE_EXPIRES_AT,site:process.env.NEXT_PUBLIC_SITE_URL});
 if((requireFreshRate&&process.env.ROYA_INTERNATIONAL_ENABLED!=='1')||!parsed.success)throw new ShopError('PAYMENT_UNAVAILABLE',503);
 const c=parsed.data,url=new URL(c.url),site=new URL(c.site);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||site.protocol!=='https:'||(requireFreshRate&&Date.parse(c.expires)<=Date.now()))throw new ShopError('PAYMENT_UNAVAILABLE',503);
 return {...c,url:url.origin,site:site.origin};
}
export function requireForeign(request:Request){if(!foreignCountry(request.headers,process.env.ROYA_TRUST_GEO_HEADER==='1'))throw new ShopError('INTERNATIONAL_UNAVAILABLE',403);}
export function cryptoQuote(totalToman:number){const c=cryptoConfig();return {amountUsdCents:usdCents(totalToman,c.rate),tomanPerUsd:c.rate,rateExpiresAt:c.expires};}
