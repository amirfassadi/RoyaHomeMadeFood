export function stagingBlockedPath(path:string,env:Record<string,string|undefined>=process.env){
  path=path.replace(/\/+$/,'')+'/';
  if(env.ROYA_LIVE_PAYMENTS!=='1' && (/^\/api\/payment\//.test(path)||/^\/api\/admin\/orders\/(reconcile|cod-paid)\//.test(path)))return true;
  if(env.ROYA_ACCEPT_ORDERS!=='1' && /^\/api\/(shop|international)\/checkout\//.test(path))return true;
  if(env.ROYA_SEND_SMS!=='1' && path==='/api/customer/code/')return true;
  return false;
}
