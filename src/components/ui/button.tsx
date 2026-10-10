import type {ButtonHTMLAttributes} from 'react';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'primary' | 'secondary' | 'ghost'};
export function buttonClasses(variant: Props['variant'] = 'primary') {
  return `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
    variant === 'primary' ? 'bg-roya-green text-white hover:bg-roya-green-dark' :
    variant === 'secondary' ? 'border border-roya-line bg-white text-roya-ink hover:bg-roya-leaf' :
    'text-roya-green hover:bg-roya-leaf'
  }`;
}
export function Button({variant, className = '', ...props}: Props) {
  return <button className={`${buttonClasses(variant)} ${className}`} {...props} />;
}
