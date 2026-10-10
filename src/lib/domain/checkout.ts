export function checkedMoney(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new RangeError('Invalid total');
  return amount;
}
export function tomanToRial(amount: number) {return checkedMoney(amount) * 10;}
export function discountAmount(subtotal: number, d: {type: 'FIXED'|'PERCENT'; value: number; maxDiscountToman: number|null}) {
  checkedMoney(subtotal);
  const amount = d.type === 'FIXED' ? d.value : Number(BigInt(subtotal) * BigInt(d.value) / 100n);
  return checkedMoney(Math.min(subtotal, amount, d.maxDiscountToman ?? subtotal));
}
export function capacityDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran', year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
