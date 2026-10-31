import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {contactReplySchema} from '@/lib/validation/contact';
import {replyToContact} from '@/lib/server/contact-replies';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,contactReplySchema,'communications');
 return json(await replyToContact(body,user.id));
}catch(error){return adminFailure(error);}}
