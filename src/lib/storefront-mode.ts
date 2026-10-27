export function privateDatabaseCatalogEnabled(env:Record<string,string|undefined>=process.env){
 if(env.ROYA_PRIVATE_DB_CATALOG!=='1')return false;
 if(env.SITES_STATIC_PREVIEW==='1'||env.ROYA_DEPLOYMENT_ROLE!=='standalone'||env.ROYA_DEMO_CATALOG!=='1'||['ROYA_LIVE_PAYMENTS','ROYA_ACCEPT_ORDERS','ROYA_SEND_SMS','ROYA_INDEXABLE'].some(key=>env[key]!=='0'))throw new Error('PRIVATE_CATALOG_CONFIGURATION');
 return true;
}
