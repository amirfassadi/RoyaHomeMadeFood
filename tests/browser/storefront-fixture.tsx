import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NextIntlClientProvider} from 'next-intl';
import {CartProvider,useCart} from '../../src/components/store/cart-provider';
import {CartPage} from '../../src/components/store/cart-page';
import {PrototypeRegionProvider,CountrySelect} from '../../src/components/store/prototype-region';
import {PricingProvider} from '../../src/components/store/pricing-provider';
import {PrototypeCheckout} from '../../src/components/store/prototype-checkout';
import {PrototypeTracking} from '../../src/components/store/prototype-tracking';
import {PrototypeOrders} from '../../src/components/admin/prototype-orders';
import {demoCatalog} from '../../src/lib/catalog/demo';
import {sampleMarketRates,defaultPricingPolicy} from '../../src/lib/pricing';
import fa from '../../messages/fa.json';
import en from '../../messages/en.json';

// Controlled, isolated fixture values. Never fetched from or written to a VPS.
const locale=new URLSearchParams(location.search).get('locale')==='en'?'en':'fa';
document.documentElement.lang=locale;document.documentElement.dir=locale==='fa'?'rtl':'ltr';
if(!localStorage.getItem('roya-market-rates-v1'))localStorage.setItem('roya-market-rates-v1',JSON.stringify({...sampleMarketRates(),sample:false}));
localStorage.setItem('roya-pricing-policy-v1',JSON.stringify({...defaultPricingPolicy,feeBps:750,countryFees:{TR:300}}));
const catalog={...demoCatalog,products:[{...demoCatalog.products[3],id:'fixture-kg',nameFa:'ژامبون آزمایشی',nameEn:'Test cold cuts',unit:'KG' as const,
 priceToman:1500000,priceBasisQuantity:1,minOrderQuantity:0.5,orderStepQuantity:0.5,stockQuantity:null,dailyCapacity:null,preparationMinutes:2880,media:[]},
 {...demoCatalog.products[1],id:'fixture-limited',nameFa:'محصول محدود آزمایشی',nameEn:'Test limited product',stockQuantity:2,media:[]}]};
function Fixture(){
 const [view,setView]=useState('cart'),cart=useCart();
 return <main className="mx-auto max-w-6xl p-4"><nav className="mb-5 flex flex-wrap gap-3" aria-label="Fixture navigation">{['cart','checkout','tracking','admin'].map(v=><button type="button" key={v} onClick={()=>setView(v)} className="min-h-11 rounded border p-2">{'FIXTURE '+v}</button>)}<button type="button" className="min-h-11 rounded border p-2" onClick={()=>cart.add('fixture-kg',0.5)}>FIXTURE add half kg</button><button type="button" className="min-h-11 rounded border p-2" onClick={()=>cart.add('fixture-limited',1)}>FIXTURE add limited</button></nav>
  {view==='cart'?<><CountrySelect id="fixture-country"/><div className="mt-5"><CartPage/></div></>:view==='checkout'?<PrototypeCheckout/>:view==='tracking'?<PrototypeTracking/>:<PrototypeOrders/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale={locale} messages={locale==='fa'?fa:en}><CartProvider catalog={catalog}><PrototypeRegionProvider isDemo><PricingProvider><Fixture/></PricingProvider></PrototypeRegionProvider></CartProvider></NextIntlClientProvider>);
