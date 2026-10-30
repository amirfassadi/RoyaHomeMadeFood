import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CustomerMessages} from '../src/components/admin/customer-messages';
import {AdminAccessContext} from '../src/components/admin/access';
test('customer messaging opens disabled with a draft composer and separate service/marketing controls',()=>{const html=renderToStaticMarkup(React.createElement(AdminAccessContext.Provider,{value:{adminOwner:true,adminPermissions:[],mustChangePassword:false}},React.createElement(CustomerMessages,{isDemo:false})));for(const copy of ['غیرفعال؛ هیچ ارسال خودکاری انجام نمی‌شود','فعال‌سازی اصلی ارسال واقعی','ذخیره پیش‌نویس','محصول جدید','تخفیف دوره‌ای','اول ایمیل، سپس پیامک'])assert(html.includes(copy));assert(!html.includes('checked=""'));});
