import 'server-only';
import {stagingBlockedPath} from '@/lib/staging-policy';
export function withBackendTrust<R extends Request,A extends unknown[]>(handler:(request:R,...args:A)=>Response|Promise<Response>){
  return async(request:R,...args:A):Promise<Response>=>{
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/internal/'))return Response.json({error:'NOT_FOUND'},{status:404,headers:{'Cache-Control':'no-store'}});
    if(process.env.ROYA_DEPLOYMENT_ROLE!=='standalone')return Response.json({error:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});
    if(stagingBlockedPath(path))return Response.json({error:'STAGING_ONLY'},{status:503,headers:{'Cache-Control':'no-store'}});
    return handler(request,...args);
  };
}
