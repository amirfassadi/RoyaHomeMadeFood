export type Status='PENDING'|'PREPARING'|'SHIPPED'|'DELIVERED'|'CANCELLED';
export function allowedTransition(from:Status,to:Status){
 return from===to || ({PENDING:['PREPARING','CANCELLED'],PREPARING:['SHIPPED','CANCELLED'],SHIPPED:['DELIVERED'],DELIVERED:[],CANCELLED:[]} as Record<Status,Status[]>)[from].includes(to);
}
export function canReleaseCancellation(method:string,paymentStatus:string,requestState:string|null){
 // Never release inventory while a gateway request or payment may still complete.
 return method==='BANK_TRANSFER' || method==='CASH_ON_DELIVERY' || paymentStatus==='PAID' || (requestState==='NEW'||requestState==='REJECTED');
}
