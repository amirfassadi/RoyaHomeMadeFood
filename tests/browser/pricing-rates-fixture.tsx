import {createRoot} from 'react-dom/client';
import {NextIntlClientProvider} from 'next-intl';
import {useState} from 'react';
import {PricingSettings} from '../../src/components/admin/pricing-settings';
import {PricingProvider,usePricing} from '../../src/components/store/pricing-provider';
import {CurrencyRates} from '../../src/components/store/currency-rates';
import {PrototypeRegionProvider} from '../../src/components/store/prototype-region';
import {CartProvider,useCart} from '../../src/components/store/cart-provider';
import {PrototypeCheckout} from '../../src/components/store/prototype-checkout';
import {demoCatalog} from '../../src/lib/catalog/demo';
import fa from '../../messages/fa.json';
import en from '../../messages/en.json';

// Browser-test fixture only. All HTTP traffic is restricted by the harness to
// its ephemeral loopback server; no VPS, market provider or account is used.
const query=new URLSearchParams(location.search),locale=query.get('locale')==='fa'?'fa':'en';
document.documentElement.lang=locale;document.documentElement.dir=locale==='fa'?'rtl':'ltr';
const catalog={...demoCatalog,products:[{...demoCatalog.products[3],id:'rates-test-kg',
  nameFa:'ژامبون آزمایشی',nameEn:'Test cold cuts',unit:'KG' as const,priceToman:1500000,
  priceBasisQuantity:1,minOrderQuantity:0.5,orderStepQuantity:0.5,preparationMinutes:2880,
  stockQuantity:null,dailyCapacity:null,media:[]}]};
function Probe(){const p=usePricing();return <output hidden data-testid="pricing-state">{JSON.stringify({policy:p.policy,rates:p.rates,feed:p.feed,ready:p.ready,error:p.error,policyError:p.policyError,stale:p.stale})}</output>;}
function Shopper(){
  const [view,setView]=useState('rates'),cart=useCart();
  return <PricingProvider mode="store"><nav aria-label="Fixture controls"><button onClick={()=>setView('rates')}>FIXTURE rates</button><button onClick={()=>setView('checkout')}>FIXTURE checkout</button><button onClick={()=>cart.add('rates-test-kg',1)}>FIXTURE add kg</button></nav><Probe/>{view==='rates'?<CurrencyRates detailed/>:<PrototypeCheckout/>}</PricingProvider>;
}
createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale={locale} messages={locale==='fa'?fa:en}><main className="mx-auto max-w-6xl p-4">{query.get('view')==='admin'?<PricingSettings mode="store"/>:<CartProvider catalog={catalog}><PrototypeRegionProvider isDemo><Shopper/></PrototypeRegionProvider></CartProvider>}</main></NextIntlClientProvider>);
