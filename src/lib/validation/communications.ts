import {z} from 'zod';
export const announcementSchema=z.object({id:z.string().min(1).max(100).optional(),expectedUpdatedAt:z.iso.datetime().optional(),titleFa:z.string().trim().min(2).max(150),titleEn:z.string().trim().min(2).max(150),bodyFa:z.string().trim().min(5).max(3000),bodyEn:z.string().trim().min(5).max(3000),startsAt:z.iso.datetime().nullable(),expiresAt:z.iso.datetime().nullable(),active:z.boolean()}).strict().refine(v=>!v.id||!!v.expectedUpdatedAt).refine(v=>!v.startsAt||!v.expiresAt||v.startsAt<v.expiresAt);
export const communicationActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('announcement'),announcement:announcementSchema}).strict(),
 z.object({action:z.literal('message-read'),id:z.string().min(1).max(100),read:z.boolean()}).strict(),
]);
export const passwordChangeSchema=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)}).strict().refine(v=>v.currentPassword!==v.newPassword);
