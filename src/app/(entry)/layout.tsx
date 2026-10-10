import type {ReactNode} from 'react';
export default function EntryLayout({children}: {children: ReactNode}) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
