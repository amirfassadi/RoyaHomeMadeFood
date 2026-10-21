import {NextRequest,NextResponse} from 'next/server';
import {stagingBlockedPath} from '@/lib/staging-policy';
export function proxy(request:NextRequest){
  const path=request.nextUrl.pathname;
  if(path.startsWith('/api/internal/'))return NextResponse.json({error:'NOT_FOUND'},{status:404,headers:{'Cache-Control':'no-store'}});
  if(path.startsWith('/api/')&&(process.env.ROYA_DEPLOYMENT_ROLE!=='standalone'||stagingBlockedPath(path)))return NextResponse.json({error:'STAGING_ONLY'},{status:503,headers:{'Cache-Control':'no-store'}});
  return NextResponse.next();
}
export const config={matcher:['/api/:path*']};
