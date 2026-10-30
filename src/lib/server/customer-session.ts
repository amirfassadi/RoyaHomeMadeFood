import 'server-only';
import {getServerSession} from 'next-auth';
import {authOptions} from './auth';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
export async function optionalCustomer(){
 if(isDemoCatalog()||!process.env.DATABASE_URL)return null;
 const session=await getServerSession(authOptions);if(!session?.customerId)return null;
 const user=await getDb().user.findUnique({where:{id:session.customerId},select:{id:true,name:true,mobile:true,mobileVerifiedAt:true,email:true,emailVerifiedAt:true,marketingSms:true,role:true,active:true,sessionVersion:true}});
 return user?.active&&user.role==='CUSTOMER'&&user.mobile&&user.email&&user.mobileVerifiedAt&&user.emailVerifiedAt&&user.sessionVersion===session.sessionVersion?{...user,mobile:user.mobile!,email:user.email!}:null;
}
