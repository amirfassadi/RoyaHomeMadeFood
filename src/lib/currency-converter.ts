// Accept the digits shoppers type on Persian, Arabic and English keyboards.
export function parseTomanInput(value:string):number|null{
  const normalized=value.trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0)).replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x660)).replace(/[,٬]/g,'');
  if(!/^\d{1,10}$/.test(normalized))return null;
  const amount=Number(normalized);
  return Number.isSafeInteger(amount)&&amount>0&&amount<=1_000_000_000?amount:null;
}
