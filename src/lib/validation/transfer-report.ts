import {z} from 'zod';
import {toLatinDigits} from '@/lib/format';
import {orderCodeSchema} from './checkout';
export const bankReferenceSchema=z.string().trim().transform(toLatinDigits).pipe(z.string().regex(/^[A-Za-z0-9-]{4,100}$/));
export const transferReportSchema=z.object({reference:bankReferenceSchema,amountToman:z.number().int().positive().max(2147483647),paidAt:z.iso.datetime(),accountId:z.string().min(1).max(100),note:z.string().trim().max(500).default('')}).strict();
export const submitTransferReportSchema=transferReportSchema.extend({trackingCode:orderCodeSchema,expectedReportedAt:z.iso.datetime().nullable()}).strict();
export const storedTransferReportSchema=transferReportSchema.extend({reportedAt:z.iso.datetime()}).strict();
export type TransferReport=z.infer<typeof storedTransferReportSchema>;
export function parseTransferReport(value:unknown){return storedTransferReportSchema.safeParse(value).data??null;}
