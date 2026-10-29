import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {contactSchema} from '@/lib/validation/contact';
import {getDb} from '@/lib/server/db';
import {consumeRateLimit} from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  // Static previews never receive this route. A demo server also never stores submissions.
  if (!process.env.DATABASE_URL || process.env.ROYA_DEMO_CATALOG === '1') return NextResponse.json({error: 'UNAVAILABLE'}, {status: 503});
  const origin = request.headers.get('origin');
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL;
  if (!siteOrigin || origin !== new URL(siteOrigin).origin) return NextResponse.json({error: 'ORIGIN'}, {status: 403});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({error: 'INVALID'}, {status: 415});
  try {
    // Cap actual streamed bytes too; a missing Content-Length cannot bypass the limit.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({error: 'INVALID'}, {status: 400});
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 16384) {await reader.cancel(); return NextResponse.json({error: 'TOO_LARGE'}, {status: 413});}
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success || parsed.data.website) return NextResponse.json({error: 'INVALID'}, {status: 400});
    const {name, mobile, message, locale} = parsed.data;
    // Check the fixed shared bucket first: rotating phone numbers must not
    // create unlimited per-number buckets after the shared cap is exhausted.
    if (!await consumeRateLimit('contact:global', 50, 600)) return NextResponse.json({error: 'RATE_LIMIT'}, {status: 429, headers: {'Retry-After': '600'}});
    const digest = createHash('sha256').update(mobile).digest('hex');
    if (!await consumeRateLimit(`contact:mobile:${digest}`, 3, 600)) return NextResponse.json({error: 'RATE_LIMIT'}, {status: 429, headers: {'Retry-After': '600'}});
    await getDb().contactMessage.create({data: {name, mobile, message, locale}});
    return NextResponse.json({ok: true}, {status: 201, headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({error: 'INVALID'}, {status: 400});
    return NextResponse.json({error: 'UNAVAILABLE'}, {status: 503});
  }
}

