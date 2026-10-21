import type {ReactNode} from 'react';
import {CartProvider} from './cart-provider';
import {StoreHeader} from './header';
import {StoreFooter} from './footer';
import {getCatalog} from '@/lib/server/catalog';
import {PricingProvider} from './pricing-provider';
import {CurrencyRates} from './currency-rates';
import {PrototypeRegionProvider} from './prototype-region';
export async function PageShell({children,hideRates=false}: {children: ReactNode;hideRates?:boolean}) {
  const catalog = await getCatalog();
  return <CartProvider catalog={catalog}><PrototypeRegionProvider isDemo={catalog.isDemo}><PricingProvider mode="store"><StoreHeader isDemo={catalog.isDemo}/>{!hideRates&&<CurrencyRates/>}<main id="main">{children}</main><StoreFooter/></PricingProvider></PrototypeRegionProvider></CartProvider>;
}
export function PageHeading({title, description, eyebrow}: {title: string; description?: string; eyebrow?: string}) {
  return <div className="mb-10">{eyebrow && <p className="mb-3 text-xs font-semibold text-roya-brown">{eyebrow}</p>}<h1 className="text-3xl font-extrabold leading-normal md:text-4xl">{title}</h1>{description && <p className="mt-4 max-w-2xl text-sm leading-8 text-roya-muted">{description}</p>}</div>;
}
