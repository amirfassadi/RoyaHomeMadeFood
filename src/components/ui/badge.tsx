import type {ReactNode} from 'react';
export function Badge({children, tone = 'green'}: {children: ReactNode; tone?: 'green' | 'brown' | 'neutral'}) {
  const colors = {green: 'bg-roya-leaf text-roya-green-dark', brown: 'bg-amber-50 text-roya-brown', neutral: 'bg-stone-100 text-stone-600'};
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${colors[tone]}`}>{children}</span>;
}
