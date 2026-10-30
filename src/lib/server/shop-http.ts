import 'server-only';
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import type {ZodType} from 'zod';
import {isDemoCatalog} from './catalog';
import {consumeRateLimit} from './rate-limit';
export class ShopError extends Error {constructor(public code: string, public status = 400, public retryAfter?: number) {super(code);}}
export function json(data: unknown, status=200) {return NextResponse.json(data, {status, headers:{'Cache-Control':'no-store'}});}
export function failure(e: unknown) {
  const retryAfter=e instanceof ShopError&&e.status===429&&e.retryAfter?Math.max(1,Math.ceil(e.retryAfter)):undefined;
  const response=json({error:e instanceof ShopError?e.code:'UNAVAILABLE',...(retryAfter?{retryAfter}:{})},e instanceof ShopError?e.status:503);
  if(retryAfter)response.headers.set('Retry-After',String(retryAfter));
  return response;
}
export async function readShopBody<T>(request: Request, schema: ZodType<T>, operation: string, maxBytes=16384): Promise<T> {
  if (!process.env.DATABASE_URL || isDemoCatalog()) throw new ShopError('UNAVAILABLE',503);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL;
  if (!site || request.headers.get('origin') !== new URL(site).origin) throw new ShopError('ORIGIN',403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ShopError('INVALID',415);
  if (!await consumeRateLimit(`shop:${operation}:global`, 150, 60)) throw new ShopError('RATE_LIMIT',429,60);
  const reader=request.body?.getReader(); if (!reader) throw new ShopError('INVALID');
  const chunks: Uint8Array[]=[]; let bytes=0;
  for (;;) {const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>maxBytes){await reader.cancel();throw new ShopError('INVALID',413);}chunks.push(value);}
  let body: unknown; try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ShopError('INVALID');}
  const result=schema.safeParse(body); if(!result.success)throw new ShopError('INVALID');
  return result.data;
}
export async function mobileLimit(mobile: string, operation: string, limit=10) {
  const key=createHash('sha256').update(mobile).digest('hex');
  if(!await consumeRateLimit(`shop:${operation}:${key}`,limit,600))throw new ShopError('RATE_LIMIT',429);
}
