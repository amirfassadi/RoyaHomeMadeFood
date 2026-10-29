/** Checks names only; never return credential values in errors. */
export function deploymentErrors(env:Record<string,string|undefined>){
 const errors:string[]=[];
 for(const key of ['DATABASE_URL','DIRECT_URL']){try{const url=new URL(env[key]??'');if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw new Error();}catch{errors.push(`${key}: PostgreSQL URL required`);}}
 for(const key of ['NEXT_PUBLIC_SITE_URL','NEXTAUTH_URL']){try{const u=new URL(env[key]??'');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error();}catch{errors.push(`${key}: HTTPS origin required`);}}
 if(env.NEXTAUTH_URL!==env.NEXT_PUBLIC_SITE_URL)errors.push('NEXTAUTH_URL must equal NEXT_PUBLIC_SITE_URL');
 if((env.NEXTAUTH_SECRET??'').length<32)errors.push('NEXTAUTH_SECRET: at least 32 random characters required');
 if(env.ROYA_MEDIA_UPLOADS_ENABLED!==undefined&&!['0','1'].includes(env.ROYA_MEDIA_UPLOADS_ENABLED))errors.push('ROYA_MEDIA_UPLOADS_ENABLED: use 0 or 1');
 if(env.ROYA_MEDIA_UPLOADS_ENABLED!=='0')for(const key of ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'])if(!env[key]?.trim())errors.push(`${key}: required when media uploads are enabled`);
 if(env.ROYA_DEMO_CATALOG==='1'||env.SITES_STATIC_PREVIEW==='1')errors.push('Demo/static flags must be disabled for production');
 if(!['0','1'].includes(env.ROYA_INDEXABLE??''))errors.push('ROYA_INDEXABLE: use 0 or 1');
 if(!['true','false'].includes(env.ZARINPAL_SANDBOX??''))errors.push('ZARINPAL_SANDBOX: use true or false');
 if(env.ZARINPAL_MERCHANT_ID&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ZARINPAL_MERCHANT_ID))errors.push('ZARINPAL_MERCHANT_ID: invalid UUID');
 if(env.CUSTOMER_ACCOUNTS_ENABLED==='1'){
  if((env.CUSTOMER_OTP_SECRET??'').length<32)errors.push('CUSTOMER_OTP_SECRET: at least 32 random characters required');
  for(const key of ['KAVENEGAR_API_KEY','KAVENEGAR_OTP_TEMPLATE'])if(!env[key]?.trim())errors.push(`${key}: required for customer accounts`);
 }
 if(env.ROYA_INTERNATIONAL_ENABLED==='1'){
  if(env.ROYA_TRUST_GEO_HEADER!=='1')errors.push('ROYA_TRUST_GEO_HEADER: trusted country proxy required');
  for(const key of ['BTCPAY_STORE_ID','BTCPAY_API_KEY','BTCPAY_WEBHOOK_SECRET'])if(!env[key]?.trim())errors.push(`${key}: required for international payment`);
  if((env.BTCPAY_WEBHOOK_SECRET??'').length<32)errors.push('BTCPAY_WEBHOOK_SECRET: at least 32 characters required');
  try{const u=new URL(env.BTCPAY_URL??'');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error();}catch{errors.push('BTCPAY_URL: HTTPS origin required');}
  if(!/^[1-9]\d{0,9}$/.test(env.ROYA_USD_RATE_TOMAN??'')||Number(env.ROYA_USD_RATE_TOMAN)>2147483647)errors.push('ROYA_USD_RATE_TOMAN: positive integer required');
  if(!Number.isFinite(Date.parse(env.ROYA_USD_RATE_EXPIRES_AT??''))||Date.parse(env.ROYA_USD_RATE_EXPIRES_AT!)<=Date.now())errors.push('ROYA_USD_RATE_EXPIRES_AT: future timestamp required');
 }
 return errors;
}
