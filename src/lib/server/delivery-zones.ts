import 'server-only';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
export type ZoneView={id:string;cityFa:string;cityEn:string;nameFa:string;nameEn:string;feeToman:number;deliveryMinutes:number};
export async function getZones():Promise<ZoneView[]>{
  if(isDemoCatalog())return [{id:'demo-zone',cityFa:'شهر نمونه',cityEn:'Example city',nameFa:'محدوده نمونه',nameEn:'Example zone',feeToman:50000,deliveryMinutes:120}];
  if(!process.env.DATABASE_URL)return [];
  return getDb().deliveryZone.findMany({where:{active:true},orderBy:[{cityFa:'asc'},{nameFa:'asc'}],select:{id:true,cityFa:true,cityEn:true,nameFa:true,nameEn:true,feeToman:true,deliveryMinutes:true}});
}
