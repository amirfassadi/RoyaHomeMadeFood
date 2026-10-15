// All foreign-currency calculations use integer cents, rounded up once per order.
export function usdCents(totalToman:number, tomanPerUsd:number) {
 if(!Number.isSafeInteger(totalToman)||totalToman<=0||!Number.isSafeInteger(tomanPerUsd)||tomanPerUsd<=0)throw new RangeError('Invalid money');
 return Number((BigInt(totalToman)*100n+BigInt(tomanPerUsd)-1n)/BigInt(tomanPerUsd));
}
export function decimalUsd(cents:number){return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;}
export function formatUsd(cents:number,locale='fa'){return new Intl.NumberFormat(locale==='fa'?'fa-IR':'en-US',{style:'currency',currency:'USD'}).format(cents/100);}
// Headers are trustworthy ONLY when the origin is restricted to a proxy that overwrites them.
export function foreignCountry(headers:Headers, trusted:boolean){
 const country=trusted?headers.get('x-roya-country')?.toUpperCase():null;
 return country&&/^[A-Z]{2}$/.test(country)&&!['IR','XX','T1','ZZ'].includes(country)?country:null;
}
