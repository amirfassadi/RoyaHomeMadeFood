import {quoteSchema} from '@/lib/validation/checkout';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
import {requireForeign,cryptoQuote} from '@/lib/server/international';
import {calculateQuote,publicQuote} from '@/lib/server/checkout';
import {getDb} from '@/lib/server/db';
export const runtime='nodejs';
export async function POST(request:Request){try{
 requireForeign(request);const input=await readShopBody(request,quoteSchema,'foreign-quote');
 const q=await getDb().$transaction(tx=>calculateQuote(tx,input));return json({...publicQuote(q),...cryptoQuote(q.totalToman)});
}catch(e){return failure(e);}}
