import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {TransferReportForm} from '../src/components/store/transfer-report';
const payment={trackingCode:'14050808-0001',paymentMethod:'BANK_TRANSFER',paymentStatus:'PENDING',status:'PENDING',totalToman:150000,bankTransfer:{accounts:[{id:'bank',holder:'Shop',card:'6037000000000000',iban:'',active:true}]}};
function render(p:Parameters<typeof TransferReportForm>[0]['payment'],locale='fa'){return renderToStaticMarkup(React.createElement(NextIntlClientProvider,{locale,timeZone:'Asia/Tehran',messages:{},children:React.createElement(TransferReportForm,{payment:p})}));}
test('receipt offers payment-report inputs in both languages and switches to confirmation after settlement',()=>{const html=render(payment);for(const copy of ['پرداخت کردم','شماره پیگیری رسید بانک','مبلغ واریز','تاریخ و ساعت','حساب مقصد','ثبت و اعلام واریز'])assert(html.includes(copy));assert(render(payment,'en').includes('Bank receipt reference'));const paid=render({...payment,paymentStatus:'PAID',transferReference:'BANK-1234'});assert(paid.includes('BANK-1234'));assert(!paid.includes('<form'));});
test('expired orders warn against new payments but allow reporting prior transfers; non-owners see sign-in',()=>{const expired=render({...payment,status:'CANCELLED',reservationExpiredAt:new Date().toISOString()});assert(expired.includes('پرداخت جدید نکنید'));assert(expired.includes('<form'));const denied=render({...payment,canReportTransfer:false});assert(!denied.includes('<form'));assert(denied.includes('/fa/account'),denied);});
