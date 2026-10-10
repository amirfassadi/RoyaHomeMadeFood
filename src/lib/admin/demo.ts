import {demoCatalog} from '@/lib/catalog/demo';
import {emptyData,type AdminData,type OrderDetail} from './types';
export function demoAdminData():AdminData{
 const data=emptyData(),date='2026-10-10T10:00:00.000Z';
 data.products=demoCatalog.products.map(p=>({...p,active:true,updatedAt:date,media:p.media.map(m=>({...m,altFa:m.altFa,altEn:m.altEn}))}));
 data.categories=demoCatalog.categories;
 data.orders=[{id:'demo-order',trackingCode:'نمونه نمایشی',customerName:'مشتری نمونه',mobile:'',status:'PREPARING',paymentMethod:'CASH_ON_DELIVERY',paymentStatus:'UNPAID',totalToman:850000,createdAt:date,estimatedDeliveryAt:'2026-10-11T10:00:00.000Z',refundRequired:false}];
 data.stats={products:4,orders:1,pending:0};
 data.customers=[{mobile:'',name:'مشتری نمونه',orders:1,totalToman:850000,lastOrder:date}];
 data.zones=[{id:'demo-zone',cityFa:'شهر نمونه',cityEn:'Example city',nameFa:'محدوده نمونه',nameEn:'Example zone',feeToman:50000,deliveryMinutes:120,active:true,updatedAt:date}];
 data.detail={...data.orders[0],address:'نشانی نمونه؛ اطلاعات مشتری واقعی نیست.',city:'شهر نمونه',deliveryNotes:'',deliveryZoneNameSnapshot:'محدوده نمونه',subtotalToman:800000,discountToman:0,deliveryFeeToman:50000,items:[{id:'demo-item',productNameFa:'سینی مزه نمونه',unit:'PACK',quantity:1,lineTotalToman:800000}],statusHistory:[{status:'PENDING',createdAt:date},{status:'PREPARING',createdAt:'2026-10-10T12:00:00.000Z'}],requestState:null} satisfies OrderDetail;
 return data;
}
