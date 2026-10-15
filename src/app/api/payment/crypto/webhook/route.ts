import {z} from 'zod';
import {validWebhook} from '@/lib/crypto-invoice';
import {cryptoConfig} from '@/lib/server/international';
import {getDb} from '@/lib/server/db';
import {reconcileCrypto} from '@/lib/server/btcpay';
import {json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 const c=cryptoConfig(false),reader=request.body?.getReader();if(!reader)throw new ShopError('INVALID');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new ShopError('INVALID',413);}chunks.push(value);}
 const raw=Buffer.concat(chunks);
 if(!validWebhook(raw,request.headers.get('BTCPay-Sig'),c.secret))throw new ShopError('SIGNATURE',401);
 const event=z.object({storeId:z.string(),invoiceId:z.string().min(1).max(100)}).parse(JSON.parse(raw.toString('utf8')));
 if(event.storeId!==c.store)throw new ShopError('INVALID');
 const p=await getDb().cryptoPayment.findUnique({where:{invoiceId:event.invoiceId}});
 // An invoice created just before an interrupted response needs operator recovery.
 if(!p)return json({received:false},503);
 await reconcileCrypto(p.orderId);return json({received:true});
}catch(e){return failure(e);}}
