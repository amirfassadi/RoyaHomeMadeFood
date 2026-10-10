import type {Locale} from '@/i18n/routing';
export function formatNumber(value: number, locale: Locale = 'fa') {
  return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {maximumFractionDigits: 3}).format(value);
}
export function formatToman(amount: number, locale: Locale = 'fa') {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Toman amount must be a non-negative safe integer');
  return `${formatNumber(amount, locale)} ${locale === 'fa' ? 'تومان' : 'Toman'}`;
}
export function formatDate(date: Date | string, locale: Locale = 'fa') {
  return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
    dateStyle: 'long', timeZone: 'Asia/Tehran',
  }).format(new Date(date));
}
export function toLatinDigits(input: string) {
  return input.replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char >= '۰' ? 0x6f0 : 0x660)));
}
