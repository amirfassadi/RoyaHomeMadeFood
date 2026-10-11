import type {Metadata} from 'next';
import type {Locale} from '@/i18n/routing';
import type {ProductView} from '@/lib/catalog/types';
export function siteOrigin(){try{const u=new URL(process.env.NEXT_PUBLIC_SITE_URL??'');if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;return u.origin;}catch{return null;}}
export function indexable(){return process.env.ROYA_INDEXABLE==='1' && process.env.SITES_STATIC_PREVIEW!=='1' && process.env.ROYA_DEMO_CATALOG!=='1' && siteOrigin()?.startsWith('https://')===true;}
const brand={fa:'محصولات غذایی رویا',en:'Roya Food Products'};
export const descriptions={fa:'فینگر فود، سینی مزه، سوسیس و کالباس خانگی رویا؛ غذای خانگی تازه، بدون هیچ افزودنی. سفارش و پیگیری آنلاین.',en:'Roya finger food, snack platters, homemade sausages and cold cuts. Fresh homemade food, no additives. Order and track online.'};
export function pageMetadata(locale:Locale,path:string,title:string,description=descriptions[locale],privatePage=false,image?:string):Metadata{
 const origin=siteOrigin(),url=origin?`${origin}/${locale}${path}/`:undefined,canIndex=indexable()&&!privatePage;
 return {title:`${title} | ${brand[locale]}`,description,robots:{index:canIndex,follow:canIndex},...(origin?{metadataBase:new URL(origin),alternates:{canonical:url,languages:{fa:`${origin}/fa${path}/`,en:`${origin}/en${path}/`,'x-default':`${origin}/fa${path}/`}}}:{}),openGraph:{type:'website',title,description,siteName:brand[locale],locale:locale==='fa'?'fa_IR':'en_US',alternateLocale:locale==='fa'?'en_US':'fa_IR',...(url?{url}:{}),...(image?{images:[{url:image,alt:title}]}:{})},twitter:{card:image?'summary_large_image':'summary',title,description,...(image?{images:[image]}:{})}};
}
export function jsonLd(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
export function productStructuredData(product:ProductView,locale:Locale){
 const origin=siteOrigin();if(!origin || !indexable())return null;
 const name=locale==='fa'?product.nameFa:product.nameEn,unit={KG:'KGM',GRAM:'GRM',PIECE:'C62',PACK:'XPK'}[product.unit];
 const available=[product.stockQuantity,product.dailyCapacity].every(n=>n===null||n>=product.minOrderQuantity);
 return {'@context':'https://schema.org','@type':'Product',name,description:locale==='fa'?product.descriptionFa:product.descriptionEn,sku:product.id,brand:{'@type':'Brand',name:brand[locale]},image:product.media.filter(m=>m.type==='IMAGE').map(m=>m.url),offers:{'@type':'Offer',url:`${origin}/${locale}/products/${product.slug}/`,priceCurrency:'IRR',price:product.priceToman*10,availability:`https://schema.org/${available?'InStock':'OutOfStock'}`,priceSpecification:{'@type':'UnitPriceSpecification',price:product.priceToman*10,priceCurrency:'IRR',referenceQuantity:{'@type':'QuantitativeValue',value:product.priceBasisQuantity,unitCode:unit}},eligibleQuantity:{'@type':'QuantitativeValue',minValue:product.minOrderQuantity,unitCode:unit}}};
}
