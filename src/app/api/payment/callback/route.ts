import {NextResponse} from 'next/server';
import {verifyPayment} from '@/lib/server/zarinpal';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const site=process.env.NEXT_PUBLIC_SITE_URL;
 if(!site)return new NextResponse('Payment is not configured',{status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url);let locale='fa',result='pending';
 try{const r=await verifyPayment(url.searchParams.get('attempt')??'',url.searchParams.get('nonce')??'',url.searchParams.get('Authority')??'',url.searchParams.get('Status'));locale=r.locale;result=r.result;}catch{/* Never announce success after an uncertain verification. */}
 return NextResponse.redirect(new URL(`/${locale}/payment-result/?result=${result}`,site),{status:303,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
