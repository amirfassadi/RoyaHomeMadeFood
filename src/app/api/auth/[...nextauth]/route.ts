import NextAuth from 'next-auth';
import {NextRequest,NextResponse} from 'next/server';
import {authOptions} from '@/lib/server/auth';
import {isDemoCatalog} from '@/lib/server/catalog';
export const runtime='nodejs';
const handler=NextAuth(authOptions);
export {handler as GET};
export async function POST(request:NextRequest,context:{params:Promise<{nextauth:string[]}>}){
 const site=process.env.NEXTAUTH_URL;
 if(isDemoCatalog() || !site || !process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length<32)return NextResponse.json({error:'UNAVAILABLE'},{status:503});
 if(request.headers.get('origin')!==new URL(site).origin)return NextResponse.json({error:'ORIGIN'},{status:403});
 // Bound actual streamed bytes before NextAuth parses credential forms.
 const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:'INVALID'},{status:400});
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return NextResponse.json({error:'TOO_LARGE'},{status:413});}chunks.push(value);}
 const bounded=new NextRequest(request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)});
 return handler(bounded,context);
}
