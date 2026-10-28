import {FX_SCALE,marketRatesSchema,type MarketRates} from './pricing';

function micros(value:unknown){
  if(typeof value!=='number'&&typeof value!=='string')throw new Error('RATE_INVALID');
  const number=Number(value),scaled=Math.round(number*FX_SCALE);
  if(!Number.isFinite(number)||number<=0||!Number.isSafeInteger(scaled)||scaled<=0)throw new Error('RATE_INVALID');
  return scaled;
}
export function parseMarketRates(nobitex:unknown,coinbase:unknown,now=new Date()):MarketRates{
  const n=nobitex as {status?:string;stats?:Record<string,{isClosed?:boolean;latest?:unknown}>};
  const c=coinbase as {data?:{currency?:string;rates?:Record<string,unknown>}};
  const market=n?.stats?.['usdt-rls'],rates=c?.data?.rates;
  if(n?.status!=='ok'||market?.isClosed!==false||c?.data?.currency!=='USD'||!rates)throw new Error('RATE_UNAVAILABLE');
  // Nobitex RLS is Iranian rial. The storefront uses Toman (10 rial).
  const usdtTomanMicros=Math.round(micros(market.latest)/10),usdtPerUsdMicros=micros(rates.USDT);
  const cross=BigInt(usdtTomanMicros)*BigInt(usdtPerUsdMicros);
  const usdTomanMicros=Number((cross+BigInt(FX_SCALE/2))/BigInt(FX_SCALE));
  return marketRatesSchema.parse({fetchedAt:now.toISOString(),usdtTomanMicros,usdTomanMicros,usdtPerUsdMicros,
    unitsPerUsd:{USD:FX_SCALE,EUR:micros(rates.EUR),GBP:micros(rates.GBP),AED:micros(rates.AED),TRY:micros(rates.TRY),CAD:micros(rates.CAD)}});
}
export async function fetchMarketRates():Promise<MarketRates>{
  const read=async(url:string)=>{const r=await fetch(url,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('RATE_UNAVAILABLE');return r.json();};
  const [n,c]=await Promise.all([
    read('https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'),
    read('https://api.coinbase.com/v2/exchange-rates?currency=USD'),
  ]);
  return parseMarketRates(n,c);
}
