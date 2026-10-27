import 'server-only';
import {combineMarketRates,parseNobitexRate,parseUsdRates,parseDailyUsdRates} from '@/lib/fx-rates';
import {FX_MAX_AGE,fxObservationFresh,type FxMetadata} from '@/lib/pricing';
import {marketFeedSchema,type MarketFeed} from '@/lib/market-feed';

// Fixed, public, read-only endpoints. No user-supplied URL, key or payment SDK.
export const marketRateUrls={
  nobitex:'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls',
  daily:'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
  mirror:'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  coinbase:'https://api.coinbase.com/v2/exchange-rates?currency=USD',
} as const;
const CACHE_MS=60000,RETRY_MS=30000;
type Cached<T>={value:T;fetchedAt:string};
type FxValue=ReturnType<typeof parseUsdRates>&{fxMeta:FxMetadata};
export function createMarketRateService(read:(url:string,timeoutMs?:number)=>Promise<unknown>,now:()=>number=Date.now){
  let tether:Cached<number>|null=null,fx:Cached<FxValue>|null=null;
  const failed={nobitex:false,fx:false},next={nobitex:0,fx:0};
  let pending:Promise<MarketFeed>|null=null;
  function snapshot():MarketFeed{
    const status=(entry:Cached<unknown>|null,refreshFailed:boolean,observationValid=true)=>({fetchedAt:entry?.fetchedAt??null,refreshFailed,
      state:!entry?'unavailable' as const:now()-Date.parse(entry.fetchedAt)>=-60000&&now()-Date.parse(entry.fetchedAt)<FX_MAX_AGE&&observationValid?'fresh' as const:'stale' as const});
    return marketFeedSchema.parse({schemaVersion:2,
      rates:tether&&fx?combineMarketRates(tether.value,fx.value,new Date(Math.min(Date.parse(tether.fetchedAt),Date.parse(fx.fetchedAt))),fx.value.fxMeta):null,
      tether:tether?{fetchedAt:tether.fetchedAt,usdtTomanMicros:tether.value}:null,
      fx:fx?{...fx.value,fetchedAt:fx.fetchedAt}:null,
      sources:{nobitex:status(tether,failed.nobitex),fx:status(fx,failed.fx,fxObservationFresh(fx?.value.fxMeta,now()))}});
  }
  async function readFx():Promise<FxValue>{
    // Race validated mirrors for six seconds; the last provider gets three
    // seconds only if both fail. The worst-case budget remains below eleven.
    try{
      return await Promise.any(([[marketRateUrls.daily,'jsdelivr'],[marketRateUrls.mirror,'cloudflare']] as const).map(async([url,mirror]):Promise<FxValue>=>{
        const {date,...value}=parseDailyUsdRates(await read(url,6000),now());
        return {...value,fxMeta:{provider:'currency-api',date,mirror}};
      }));
    }catch{/* Both fixed mirrors failed or returned invalid observations. */}
    return {...parseUsdRates(await read(marketRateUrls.coinbase,3000)),fxMeta:{provider:'coinbase'}};
  }
  return async():Promise<MarketFeed>=>{
    if(pending)return pending;
    const refresh=async(source:'nobitex'|'fx')=>{
      if(now()<next[source])return;
      try{
        if(source==='nobitex')tether={value:parseNobitexRate(await read(marketRateUrls.nobitex,8000)),fetchedAt:new Date(now()).toISOString()};
        else fx={value:await readFx(),fetchedAt:new Date(now()).toISOString()};
        failed[source]=false;next[source]=now()+CACHE_MS;
      }catch{failed[source]=true;next[source]=now()+RETRY_MS;}
    };
    pending=Promise.all([refresh('nobitex'),refresh('fx')]).then(snapshot);
    try{return await pending;}finally{pending=null;}
  };
}
async function readPublicJson(url:string,timeoutMs=8000){
  const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('RATE_UNAVAILABLE');
  const raw=await response.text();
  if(raw.length>256000)throw new Error('RATE_INVALID');
  return JSON.parse(raw) as unknown;
}
// The standalone Node process shares this bounded cache across visitors.
export const getMarketFeed=createMarketRateService(readPublicJson);
