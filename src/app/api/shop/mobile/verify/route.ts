import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){return json({enabled:false,required:false});}
export async function POST(){return json({error:'USE_ACCOUNT_REGISTRATION'},410);}
