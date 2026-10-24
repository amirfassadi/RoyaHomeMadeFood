import type {CatalogView} from './catalog/types';
import {estimateDelivery} from './domain/order';

export type DemoDeliverySlot='14–18'|'18–21';
export function demoPreparationMinutes(catalog:CatalogView,items:{productId:string}[]){
  // quoteDemo rejects missing products; an empty basket must still render.
  return Math.max(0,...items.map(i=>catalog.products.find(p=>p.id===i.productId)?.preparationMinutes??0));
}
export function earliestDemoDelivery(now:Date,preparationMinutes:number){
  // Keep the simulator's one-day minimum; this is not a live delivery promise.
  return estimateDelivery(now,[preparationMinutes,1440],0);
}
export function demoDeliveryChoices(now:number,preparationMinutes:number,slot:DemoDeliverySlot):string[]{
  const earliest=earliestDemoDelivery(new Date(now),preparationMinutes);
  const first=new Date(earliest);
  // Tehran sample windows start at 14:00 / 18:00 (UTC+03:30).
  first.setUTCHours(slot==='18–21'?14:10,30,0,0);
  if(first.getTime()<earliest.getTime())first.setUTCDate(first.getUTCDate()+1);
  return [0,1,2].map(days=>new Date(first.getTime()+days*86400000).toISOString());
}
