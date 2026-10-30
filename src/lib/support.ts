import {z} from 'zod';

export const supportActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('send'),body:z.string().trim().min(1).max(2000),clientId:z.uuid()}).strict(),
 z.object({action:z.literal('read'),throughSequence:z.number().int().min(0).max(2147483647)}).strict()
]);
export type SupportAction=z.infer<typeof supportActionSchema>;
export const supportQuerySchema=z.object({before:z.coerce.number().int().positive().max(2147483647).optional()}).strict();
export type SupportMessageView={id:string;sequence:number;body:string;fromAdmin:boolean;createdAt:string};
export type SupportHistory={threadId:string|null;messages:SupportMessageView[];hasOlder:boolean;lastSequence:number;otherReadSequence:number};
export type SupportCustomer={id:string;name:string;mobile:string|null;email:string|null;active:boolean;createdAt:string};
export type SupportInbox={threads:{id:string;customer:{name:string;mobile:string|null};preview:string;updatedAt:string;unread:boolean}[];page:number;hasMore:boolean};
export type SupportCustomerContext={customer:SupportCustomer;orderCount:number;paidTotalToman:number;orders:{id:string;trackingCode:string;invoiceNumber:string|null;paymentReference:string|null;transferReference:string|null;totalToman:number;status:string;paymentStatus:string;paymentMethod:string;createdAt:string}[]};
