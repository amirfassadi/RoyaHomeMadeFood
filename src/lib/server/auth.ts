import 'server-only';
import {createHash} from 'node:crypto';
import type {NextAuthOptions} from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import {getServerSession} from 'next-auth';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
import {consumeRateLimit} from './rate-limit';
import {loginSchema} from '@/lib/validation/admin';
import {verifyPassword} from '@/lib/admin/password';
import {ShopError} from './shop-http';
export async function authorizeAdmin(credentials:unknown){
  if(isDemoCatalog() || !process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length<32)return null;
  const parsed=loginSchema.safeParse(credentials);if(!parsed.success)return null;
  const {mobile,password}=parsed.data,digest=createHash('sha256').update(mobile).digest('hex');
  if(!await consumeRateLimit('admin-login:global',60,60) || !await consumeRateLimit(`admin-login:${digest}`,5,600))return null;
  const user=await getDb().user.findUnique({where:{mobile}});
  const valid=await verifyPassword(password,user?.passwordHash??null);
  if(!valid || !user?.active || user.role!=='ADMIN' || user.twoFactorEnabled)return null;
  return {id:user.id,name:user.name,sessionVersion:user.sessionVersion};
}
export const authOptions:NextAuthOptions={
 secret:process.env.NEXTAUTH_SECRET,
 session:{strategy:'jwt',maxAge:8*60*60},pages:{signIn:'/admin/login/'},
 providers:[CredentialsProvider({name:'Roya Admin',credentials:{mobile:{label:'Mobile',type:'text'},password:{label:'Password',type:'password'}},authorize:authorizeAdmin})],
 callbacks:{async jwt({token,user}){if(user){token.adminId=user.id;token.sessionVersion=(user as {sessionVersion?:number}).sessionVersion;}return token;},async session({session,token}){session.adminId=typeof token.adminId==='string'?token.adminId:undefined;session.sessionVersion=typeof token.sessionVersion==='number'?token.sessionVersion:undefined;return session;}}
};
export async function requireAdmin(){
 if(isDemoCatalog() || !process.env.DATABASE_URL)throw new ShopError('UNAUTHORIZED',401);
 const session=await getServerSession(authOptions);
 if(!session?.adminId)throw new ShopError('UNAUTHORIZED',401);
 const user=await getDb().user.findUnique({where:{id:session.adminId},select:{id:true,name:true,active:true,role:true,sessionVersion:true}});
 if(!user || !user.active || user.role!=='ADMIN' || user.sessionVersion!==session.sessionVersion)throw new ShopError('UNAUTHORIZED',401);
 return user;
}
