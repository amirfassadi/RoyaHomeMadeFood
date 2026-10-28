import {json,failure,ShopError} from '@/lib/server/shop-http';
import {getDb} from '@/lib/server/db';
import {shippingSettingsSchema} from '@/lib/validation/shipping';
import {isDemoCatalog} from '@/lib/server/catalog';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{
 if(isDemoCatalog()||!process.env.DATABASE_URL)throw new ShopError('UNAVAILABLE',503);
 const setting=await getDb().setting.findUnique({where:{key:'shipping'}});
 return json({enabled:setting?shippingSettingsSchema.parse(setting.value).enabled:false});
}catch(e){return failure(e);}}
