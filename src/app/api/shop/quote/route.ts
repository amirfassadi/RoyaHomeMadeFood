import {quoteSchema} from '@/lib/validation/checkout';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
import {getDb} from '@/lib/server/db';
import {calculateQuote,publicQuote} from '@/lib/server/checkout';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=await readShopBody(request,quoteSchema,'quote');const q=await getDb().$transaction(tx=>calculateQuote(tx,input),{isolationLevel:'RepeatableRead'});return json(publicQuote(q));}catch(e){return failure(e);}}
