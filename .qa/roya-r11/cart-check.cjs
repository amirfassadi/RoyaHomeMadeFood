const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async c=>{
 const evidence=[];
 const button=text=>`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(text)})`;
 const main=()=>c.evaluate("document.querySelector('main').innerText");
 const plus="document.querySelector('button[aria-label=\"افزایش مقدار\"]')";
 const qty=q=>c.until(`document.querySelector('main output')?.innerText.startsWith(${JSON.stringify(q)})`);
 const add=async()=>{await c.until("[...document.querySelectorAll('button')].some(b=>b.innerText==='افزودن به سبد'&&!b.disabled)");if((await c.evaluate("document.querySelector('main output')?.innerText")).startsWith('۰٫۵'))await c.click(plus);await qty('۱ ');await c.until("[...document.querySelectorAll('button')].some(b=>b.innerText==='افزودن به سبد'&&!b.disabled)");await c.click(button('افزودن به سبد'));await c.until("document.querySelector('main').innerText.includes('به سبد اضافه شد')");};
 if((await c.evaluate('location.pathname')).includes('/cart/')){
  if(await c.evaluate("!!document.querySelector('main article')")){await c.click(button('حذف'));await c.until("document.querySelector('main').innerText.includes('سبد خرید شما خالی است')");}
 }
 await c.send('Page.navigate',{url:'https://royahealthyfood.ir/fa/products/chicken-mushroom-cold-cuts/'});
 await c.until("document.querySelector('main')?.innerText.includes('مقدار سفارش')");
 await add();
 await c.click("document.querySelector('a[href=\"/fa/cart/\"]')");
 await c.until("document.querySelector('main article')");
 await qty('۱ ');
 let text=await main();assert.match(text,/۱٬۵۰۰٬۰۰۰/);
 evidence.push({check:'cart_1kg',result:'PASS',main:text});
 await c.click(plus);await qty('۱٫۵ ');await c.click(plus);await qty('۲ ');
 text=await main();assert.match(text,/۳٬۰۰۰٬۰۰۰/);
 evidence.push({check:'cart_2kg',result:'PASS',main:text});
 await c.screenshot('cart-2kg.png');
 await c.click(button('حذف'));
 await c.until("document.querySelector('main').innerText.includes('سبد خرید شما خالی است')");
 evidence.push({check:'remove_and_empty',result:'PASS',main:await main()});
 await c.screenshot('cart-empty.png');
 await c.send('Page.navigate',{url:'https://royahealthyfood.ir/fa/products/chicken-mushroom-cold-cuts/'});
 await c.until("document.querySelector('main')?.innerText.includes('ژامبون')");
 await add();
 await c.click("document.querySelector('a[href=\"/fa/cart/\"]')");
 await c.until("[...document.querySelectorAll('main a')].some(a=>a.innerText==='ادامه و ثبت سفارش')");
 await c.click("[...document.querySelectorAll('main a')].find(a=>a.innerText==='ادامه و ثبت سفارش')");
 await c.until("document.querySelector('main')?.innerText.includes('پر کردن اطلاعات نمونه')",30000);
 evidence.push({check:'guest_checkout_open',result:'PASS',main:await main()});
 await fs.writeFile(path.join(__dirname,'evidence-cart.json'),JSON.stringify({time:new Date().toISOString(),evidence,events:c.events},null,2));
 console.log(JSON.stringify({evidence,controls:await c.evaluate("[...document.querySelectorAll('main input,main select,main textarea,main button')].map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,value:e.value,text:e.tagName==='BUTTON'?e.innerText:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.text})):null}))"),events:c.events},null,2));
};
