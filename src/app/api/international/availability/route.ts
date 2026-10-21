import {withBackendTrust} from '@/lib/server/api-guard';
import {foreignCountry} from '@/lib/international';
import {cryptoConfig} from '@/lib/server/international';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
async function handleGET(request:Request){
 const eligible=!!foreignCountry(request.headers,process.env.ROYA_TRUST_GEO_HEADER==='1');
 let ready=false;try{cryptoConfig();ready=eligible;}catch{}
 return json({eligible,ready});
}

export const GET=withBackendTrust(handleGET);
