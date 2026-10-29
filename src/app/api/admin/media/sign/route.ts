import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {randomUUID} from 'node:crypto';
import {signMediaSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {getCloudinary,mediaUploadsEnabled} from '@/lib/server/cloudinary';
import {requireAdmin} from '@/lib/server/auth';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){try{await requireAdmin();return json({enabled:mediaUploadsEnabled()});}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{
const {user,body}=await adminBody(request,signMediaSchema);const cloud=getCloudinary();const public_id=`roya/products/${randomUUID()}`,timestamp=Math.floor(Date.now()/1000);const transformation=body.type==='VIDEO'?'c_limit,w_1280,h_1280/f_mp4,vc_h264,q_auto':'c_limit,w_1800,h_1800/f_webp,q_auto';const params={public_id,timestamp,transformation,overwrite:false};const signature=cloud.utils.api_sign_request(params,process.env.CLOUDINARY_API_SECRET!);const ticket=await getDb().mediaUpload.create({data:{publicId:public_id,type:body.type,adminId:user.id}});return json({uploadId:ticket.id,cloudName:process.env.CLOUDINARY_CLOUD_NAME,apiKey:process.env.CLOUDINARY_API_KEY,resourceType:body.type==='VIDEO'?'video':'image',params,signature});
}catch(e){return adminFailure(e);}}
