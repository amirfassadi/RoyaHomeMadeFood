import type {ReactNode} from 'react';
import {StoreHeader} from './header';
import {StoreFooter} from './footer';
import {getCatalog} from '@/lib/server/catalog';
export async function PageShell({children}: {children: ReactNode}) {
  const {isDemo} = await getCatalog();
  return <><StoreHeader isDemo={isDemo}/><main id="main">{children}</main><StoreFooter/></>;
}
export function PageHeading({title, description, eyebrow}: {title: string; description?: string; eyebrow?: string}) {
  return <div className="mb-10">{eyebrow && <p className="mb-3 text-xs font-semibold text-roya-brown">{eyebrow}</p>}<h1 className="text-3xl font-extrabold leading-normal md:text-4xl">{title}</h1>{description && <p className="mt-4 max-w-2xl text-sm leading-8 text-roya-muted">{description}</p>}</div>;
}
