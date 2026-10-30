import 'server-only';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {storedEmailSettingsSchema,type EmailSettingsView} from '@/lib/validation/email-settings';
export const emailSettingsKey='customer-email';
function encryptionKey(){const secret=process.env.NEXTAUTH_SECRET;if(!secret||secret.length<32)throw new ShopError('EMAIL_CONFIGURATION',503);return createHash('sha256').update(`roya:email-key:v1:${secret}`).digest();}
const aad=Buffer.from('roya:email-settings:v1');
export function encryptEmailKey(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(aad);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');}
export function decryptEmailKey(value:string){try{const [version,iv,encrypted,tag,...rest]=value.split('.');if(version!=='v1'||rest.length||!iv||!encrypted||!tag)throw new Error();const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8');}catch{throw new ShopError('EMAIL_CONFIGURATION',503);}}
export async function readEmailConfiguration(){
 const row=await getDb().setting.findUnique({where:{key:emailSettingsKey}});
 if(row){const parsed=storedEmailSettingsSchema.safeParse(row.value);if(!parsed.success)throw new ShopError('EMAIL_CONFIGURATION',503);return {...parsed.data,apiKey:decryptEmailKey(parsed.data.apiKeyEnc),source:'panel' as const,updatedAt:row.updatedAt.toISOString()};}
 const key=process.env.RESEND_API_KEY?.trim(),from=process.env.CUSTOMER_EMAIL_FROM?.trim();
 return key&&from?{enabled:true,from,apiKey:key,verifiedAt:null,test:null,source:'environment' as const,updatedAt:null}:null;
}
export async function emailConfigured(){const c=await readEmailConfiguration();return !!c?.enabled&&(c.source==='environment'||!!c.verifiedAt);}
export async function emailSettingsView():Promise<EmailSettingsView>{const c=await readEmailConfiguration();return {enabled:c?.enabled??false,configured:!!c?.enabled&&(c.source==='environment'||!!c.verifiedAt),from:c?.from??'',keyPresent:!!c?.apiKey,source:c?.source??'none',verified:c?.source==='environment'||!!c?.verifiedAt,updatedAt:c?.updatedAt??null,testPending:!!c?.test?.ready&&Date.parse(c.test.expiresAt)>Date.now()};}
export type EmailConfiguration=NonNullable<Awaited<ReturnType<typeof readEmailConfiguration>>>;
export async function sendEmailWithConfiguration(config:EmailConfiguration,input:{to:string;subject:string;text:string}){
 try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:config.from,to:[input.to],subject:input.subject,text:input.text}),signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});const result=await response.json();if(!response.ok||typeof result.id!=='string')throw new Error();}catch{throw new ShopError('EMAIL_UNAVAILABLE',503);}
}
export async function sendCustomerEmail(input:{to:string;subject:string;text:string}){const c=await readEmailConfiguration();if(!c?.enabled||c.source==='panel'&&!c.verifiedAt)throw new ShopError('EMAIL_CONFIGURATION',503);await sendEmailWithConfiguration(c,input);}
