import type {AdminPermission} from '@/lib/admin/permissions';
import 'server-only';
import type {ZodType} from 'zod';
import {Prisma} from '@/generated/prisma/client';
import {requireAdmin} from './auth';
import {readShopBody,failure,ShopError} from './shop-http';
export async function adminBody<T>(request:Request,schema:ZodType<T>,permission?:AdminPermission|'admins'){const user=await requireAdmin(permission);const body=await readShopBody(request,schema,'admin',131072);return {user,body};}
export function adminFailure(e:unknown){if(e instanceof Prisma.PrismaClientKnownRequestError && e.code==='P2002')return failure(new ShopError('DUPLICATE',409));return failure(e);}
