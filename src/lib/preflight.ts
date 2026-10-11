/** Checks names only; never return credential values in errors. */
export function deploymentErrors(env:Record<string,string|undefined>){
 const errors:string[]=[];
 for(const key of ['DATABASE_URL','DIRECT_URL']){try{const url=new URL(env[key]??'');if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw new Error();}catch{errors.push(`${key}: PostgreSQL URL required`);}}
 for(const key of ['NEXT_PUBLIC_SITE_URL','NEXTAUTH_URL']){try{const u=new URL(env[key]??'');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error();}catch{errors.push(`${key}: HTTPS origin required`);}}
 if(env.NEXTAUTH_URL!==env.NEXT_PUBLIC_SITE_URL)errors.push('NEXTAUTH_URL must equal NEXT_PUBLIC_SITE_URL');
 if((env.NEXTAUTH_SECRET??'').length<32)errors.push('NEXTAUTH_SECRET: at least 32 random characters required');
 for(const key of ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'])if(!env[key]?.trim())errors.push(`${key}: required`);
 if(env.ROYA_DEMO_CATALOG==='1'||env.SITES_STATIC_PREVIEW==='1')errors.push('Demo/static flags must be disabled for production');
 if(!['0','1'].includes(env.ROYA_INDEXABLE??''))errors.push('ROYA_INDEXABLE: use 0 or 1');
 if(!['true','false'].includes(env.ZARINPAL_SANDBOX??''))errors.push('ZARINPAL_SANDBOX: use true or false');
 if(env.ZARINPAL_MERCHANT_ID&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ZARINPAL_MERCHANT_ID))errors.push('ZARINPAL_MERCHANT_ID: invalid UUID');
 if(env.CUSTOMER_ACCOUNTS_ENABLED==='1'){
  if((env.CUSTOMER_OTP_SECRET??'').length<32)errors.push('CUSTOMER_OTP_SECRET: at least 32 random characters required');
  for(const key of ['KAVENEGAR_API_KEY','KAVENEGAR_OTP_TEMPLATE'])if(!env[key]?.trim())errors.push(`${key}: required for customer accounts`);
 }
 return errors;
}
