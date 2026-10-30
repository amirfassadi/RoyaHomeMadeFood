import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OrderDetail} from '../src/components/admin/order-detail';
import {AdminAccessContext} from '../src/components/admin/access';
import type {OrderDetail as Detail} from '../src/lib/admin/types';
const initial:Detail={id:'order',trackingCode:'14050808-0001',customerName:'Buyer',mobile:'09123456789',status:'PENDING',paymentMethod:'BANK_TRANSFER',paymentStatus:'PENDING',totalToman:1000,createdAt:new Date().toISOString(),estimatedDeliveryAt:new Date().toISOString(),refundRequired:false,address:'Test address',city:'Tehran',deliveryNotes:null,deliveryZoneNameSnapshot:'Zone',subtotalToman:1000,discountToman:0,deliveryFeeToman:0,items:[{id:'item',productNameFa:'غذا',unit:'PIECE',quantity:1,lineTotalToman:1000}],statusHistory:[{status:'PENDING',createdAt:new Date().toISOString()}],requestState:null,transferReport:{reference:'123456',amountToman:1000,paidAt:new Date().toISOString(),reportedAt:new Date().toISOString(),accountId:'bank',note:''}};
test('admin order details render a submitted transfer and payment confirmation controls',()=>{const html=renderToStaticMarkup(React.createElement(AdminAccessContext.Provider,{value:{adminOwner:true,adminPermissions:[],mustChangePassword:false}},React.createElement(OrderDetail,{initial,isDemo:false})));assert(html.includes('تأیید دریافت وجه'));assert(html.includes('123456'));});
