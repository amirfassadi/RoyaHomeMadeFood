import {createRoot} from 'react-dom/client';
import {NextIntlClientProvider} from 'next-intl';
import {StoreHeader} from '../../src/components/store/header';
import {CartProvider} from '../../src/components/store/cart-provider';
import {PrototypeRegionProvider} from '../../src/components/store/prototype-region';
import {demoCatalog} from '../../src/lib/catalog/demo';
import {cartStorageKey} from '../../src/lib/catalog/snapshot';
import fa from '../../messages/fa.json';
import en from '../../messages/en.json';

const locale=location.pathname.startsWith('/en/')?'en':'fa';
document.documentElement.lang=locale;
document.documentElement.dir=locale==='fa'?'rtl':'ltr';
// Exercise a two-digit badge at the cart's maximum number of lines, in this
// loopback fixture only. These ids never leave the isolated browser.
const count=new URLSearchParams(location.search).get('count')==='30'?30:0;
localStorage.setItem(cartStorageKey(demoCatalog),JSON.stringify(Array.from({length:count},(_,i)=>({productId:'header-fixture-'+i,quantity:1}))));
createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale==='fa'?fa:en}>
    <CartProvider catalog={demoCatalog}><PrototypeRegionProvider isDemo>
      <StoreHeader isDemo/>
      <main id="main" className="section-shell py-10" tabIndex={-1}><h1>HEADER_FIXTURE_READY</h1></main>
    </PrototypeRegionProvider></CartProvider>
  </NextIntlClientProvider>
);
