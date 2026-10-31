import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ContactReplyBox} from '../src/components/admin/contact-reply';
import {contactSchema} from '../src/lib/validation/contact';
const contact={id:'message',name:'Buyer',mobile:'09123456789',email:null,message:'Question for shop',locale:'fa',readAt:null,createdAt:new Date().toISOString()};
test('contact email remains optional, normalized and safe on client-server roundtrip',()=>{
 const base={name:'Buyer',mobile:contact.mobile,message:contact.message,locale:'fa'};
 for(const value of [undefined,null,'']){const parsed=contactSchema.parse({...base,email:value});assert.equal(parsed.email,null);assert(contactSchema.safeParse(parsed).success);}
 assert.equal(contactSchema.parse({...base,email:' BUYER@EXAMPLE.COM '}).email,'buyer@example.com');assert(!contactSchema.safeParse({...base,email:'wrong'}).success);
});
test('member composer offers panel replies; guest email is offered only when a contact email exists',()=>{
 function render(data:any){return renderToStaticMarkup(React.createElement(ContactReplyBox,{contact:data,delivery:{enabled:true,email:true,sms:true},isDemo:false,refresh:async()=>{}}));}
 const member=render({...contact,canPanelReply:true});assert(member.includes('ثبت در پنل مشتری'));assert(!member.includes('value="EMAIL"'));assert(!member.includes('value="SMS"'));
 const guest=render({...contact,canPanelReply:false});assert(guest.includes('value="SMS"'));assert(!guest.includes('value="EMAIL"'));
 assert(render({...contact,email:'guest@example.com',canPanelReply:false}).includes('value="EMAIL"'));
});
