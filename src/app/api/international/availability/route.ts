import {foreignCountry} from '@/lib/international';
import {cryptoConfig} from '@/lib/server/international';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(request:Request){
 const eligible=!!foreignCountry(request.headers,process.env.ROYA_TRUST_GEO_HEADER==='1');
 let ready=false;try{cryptoConfig();ready=eligible;}catch{}
 return json({eligible,ready});
}
