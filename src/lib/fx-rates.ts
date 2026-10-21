import {FX_SCALE,marketRatesSchema,fxObservationFresh,type MarketRates,type FxMetadata} from './pricing';

function micros(value:unknown){
  if(typeof value!=='number'&&typeof value!=='string')throw new Error('RATE_INVALID');
  const number=Number(value),scaled=Math.round(number*FX_SCALE);
  if(!Number.isFinite(number)||number<=0||!Number.isSafeInteger(scaled)||scaled<=0)throw new Error('RATE_INVALID');
  return scaled;
}
export function parseNobitexRate(nobitex:unknown){
  const n=nobitex as {status?:string;stats?:Record<string,{isClosed?:boolean;latest?:unknown}>};
  const market=n?.stats?.['usdt-rls'];
  if(n?.status!=='ok'||market?.isClosed!==false)throw new Error('RATE_UNAVAILABLE');
  // Nobitex RLS is Iranian rial. The storefront uses Toman (10 rial).
  return marketRatesSchema.shape.usdtTomanMicros.parse(Math.round(micros(market.latest)/10));
}
export function parseUsdRates(coinbase:unknown){
  const c=coinbase as {data?:{currency?:string;rates?:Record<string,unknown>}};
  const rates=c?.data?.rates;
  if(c?.data?.currency!=='USD'||!rates||micros(rates.USD)!==FX_SCALE)throw new Error('RATE_UNAVAILABLE');
  return marketRatesSchema.pick({usdtPerUsdMicros:true,unitsPerUsd:true}).parse({usdtPerUsdMicros:micros(rates.USDT),
    unitsPerUsd:{USD:FX_SCALE,EUR:micros(rates.EUR),GBP:micros(rates.GBP),AED:micros(rates.AED),TRY:micros(rates.TRY),CAD:micros(rates.CAD)}});
}
export function parseDailyUsdRates(raw:unknown,now=Date.now()){
  const data=raw as {date?:unknown;usd?:Record<string,unknown>};
  const date=typeof data?.date==='string'?data.date:'';
  const meta=marketRatesSchema.shape.fxMeta.parse({provider:'currency-api',date,mirror:'jsdelivr'});
  if(!fxObservationFresh(meta,now))throw new Error('RATE_DATE_INVALID');
  const rates=data?.usd;
  if(!rates)throw new Error('RATE_INVALID');
  const value=parseUsdRates({data:{currency:'USD',rates:{USD:rates.usd,USDT:rates.usdt,EUR:rates.eur,GBP:rates.gbp,AED:rates.aed,TRY:rates.try,CAD:rates.cad}}});
  return {...value,date};
}
export function combineMarketRates(usdtTomanMicros:number,fx:ReturnType<typeof parseUsdRates>,now=new Date(),fxMeta?:FxMetadata):MarketRates{
  const {usdtPerUsdMicros,unitsPerUsd}=fx;
  const cross=BigInt(usdtTomanMicros)*BigInt(usdtPerUsdMicros);
  const usdTomanMicros=Number((cross+BigInt(FX_SCALE/2))/BigInt(FX_SCALE));
  return marketRatesSchema.parse({fetchedAt:now.toISOString(),usdtTomanMicros,usdTomanMicros,usdtPerUsdMicros,
    unitsPerUsd,...(fxMeta?{fxMeta}:{})});
}
export function parseMarketRates(nobitex:unknown,coinbase:unknown,now=new Date()):MarketRates{
  return combineMarketRates(parseNobitexRate(nobitex),parseUsdRates(coinbase),now);
}
export async function fetchMarketRates():Promise<MarketRates>{
  const read=async(url:string)=>{const r=await fetch(url,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('RATE_UNAVAILABLE');return r.json();};
  const [n,c]=await Promise.all([
    read('https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'),
    read('https://api.coinbase.com/v2/exchange-rates?currency=USD'),
  ]);
  return parseMarketRates(n,c);
}
