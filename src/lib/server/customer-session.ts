import 'server-only';
import {getServerSession} from 'next-auth';
import {authOptions} from './auth';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
export async function optionalAccountCustomer(){
 if(isDemoCatalog()||!process.env.DATABASE_URL)return null;
 const session=await getServerSession(authOptions);if(!session?.customerId)return null;
 const user=await getDb().user.findUnique({where:{id:session.customerId},select:{id:true,name:true,mobile:true,mobileVerifiedAt:true,email:true,emailVerifiedAt:true,marketingSms:true,marketingEmail:true,role:true,active:true,sessionVersion:true}});
 return user?.active&&user.role==='CUSTOMER'&&(user.mobile||user.email)&&user.sessionVersion===session.sessionVersion?user:null;
}
export async function optionalCustomer(){
 const user=await optionalAccountCustomer();
 // اجازه به کاربر با نشست معتبر، نقش CUSTOMER، فعال بودن و sessionVersion صحیح، بدون الزام به mobileVerifiedAt
 return user ? { ...user } : null;
}
