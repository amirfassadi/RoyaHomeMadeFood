import 'server-only';
// A sample catalog never grants administrator access.
export function isDemoAdmin(){return process.env.SITES_STATIC_PREVIEW==='1' && process.env.ROYA_DEPLOYMENT_ROLE!=='standalone';}
