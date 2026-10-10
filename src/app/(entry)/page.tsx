import type {Metadata} from 'next';
export const metadata: Metadata = {title: 'محصولات غذایی رویا', robots: {index: false, follow: false}};
export default function Index() {
  return <><meta httpEquiv="refresh" content="0;url=/fa/"/><a href="/fa/">ورود به محصولات غذایی رویا</a></>;
}
