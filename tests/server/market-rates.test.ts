import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketRateService,marketRateUrls} from '../../src/lib/server/market-rates';
import {FX_SCALE,FX_MAX_AGE,ratesFresh,pricingSnapshot,defaultPricingPolicy} from '../../src/lib/pricing';
import {GET} from '../../src/app/api/shop/rates/route';
const nobitex={status:'ok',stats:{'usdt-rls':{latest:'1000000',isClosed:false}}};
const coinbase={data:{currency:'USD',rates:{USD:'1',USDT:'1.01',EUR:'.8',GBP:'.7',AED:'3.6725',TRY:'50',CAD:'1.4'}}};
const daily={date:'2026-10-21',usd:{usd:1,usdt:1.01,eur:.8,gbp:.7,aed:3.6725,try:50,cad:1.4}};

test('independent sources preserve USDT when FX fails and retry only the failed source',async()=>{
  let clock=Date.parse('2026-10-21T12:00:00Z'),broken=true;
  const calls={n:0,c:0};
  const get=createMarketRateService(async url=>{
    if(url.includes('nobitex')){calls.n++;return nobitex;}
    calls.c++;if(broken)throw new Error('Timeout');return daily;
  },()=>clock);
  const partial=await get();
  assert.equal(partial.rates,null);assert.equal(partial.tether!.usdtTomanMicros,100000*FX_SCALE);
  assert.equal(partial.sources.fx.state,'unavailable');
  await get();assert.deepEqual(calls,{n:1,c:3});
  clock+=30000;broken=false;
  const complete=await get();assert.deepEqual(calls,{n:1,c:5});
  assert.equal(complete.rates!.usdTomanMicros,101000*FX_SCALE);
  assert.equal(complete.rates!.fetchedAt,partial.tether!.fetchedAt);
  assert.equal(complete.fx!.fetchedAt,new Date(clock).toISOString());
});
test('cache coalesces concurrent visitors and failures cannot renew old checkout rates',async()=>{
  let clock=Date.parse('2026-10-21T12:00:00Z'),failed=false,calls=0;
  const get=createMarketRateService(async url=>{calls++;await Promise.resolve();if(failed)throw new Error('offline');return url.includes('nobitex')?nobitex:daily;},()=>clock);
  const feeds=await Promise.all(Array.from({length:20},()=>get()));
  assert.equal(calls,3);assert.equal(feeds[0].rates!.fetchedAt,feeds[19].rates!.fetchedAt);
  const timestamp=feeds[0].rates!.fetchedAt;failed=true;clock+=FX_MAX_AGE;
  const stale=await get();assert.equal(stale.rates!.fetchedAt,timestamp);
  assert.equal(stale.sources.nobitex.state,'stale');assert.equal(stale.sources.fx.refreshFailed,true);
  assert.equal(ratesFresh(stale.rates!,clock),false);
  assert.equal(pricingSnapshot('DE',stale.rates,defaultPricingPolicy,clock),null);
});
test('invalid and closed markets never replace the last validated value',async()=>{
  let clock=Date.parse('2026-10-21T12:00:00Z'),invalid=false;
  const get=createMarketRateService(async url=>url.includes('nobitex')?(invalid?{status:'ok',stats:{'usdt-rls':{latest:'NaN',isClosed:true}}}:nobitex):daily,()=>clock);
  const first=await get();clock+=60000;invalid=true;
  const next=await get();assert.deepEqual(next.tether,first.tether);
  assert.equal(next.sources.nobitex.refreshFailed,true);
  assert.equal(next.rates!.fetchedAt,first.rates!.fetchedAt);
});
test('primary daily provider works without requesting Coinbase, preserving date and non-pegged USDT',async()=>{
  const calls:string[]=[];
  const get=createMarketRateService(async url=>{calls.push(url);return url===marketRateUrls.nobitex?nobitex:daily;},()=>Date.parse('2026-10-21T12:00:00Z'));
  const feed=await get();
  assert.deepEqual(calls.sort(),[marketRateUrls.nobitex,marketRateUrls.daily,marketRateUrls.mirror].sort());
  assert.deepEqual(feed.rates!.fxMeta,{provider:'currency-api',date:daily.date,mirror:'jsdelivr'});
  assert.equal(feed.rates!.usdTomanMicros,101000*FX_SCALE);
});
test('daily mirror is validated and the last provider is reached only after both mirrors fail',async()=>{
  const calls:[string,number|undefined][]=[];
  const now=()=>Date.parse('2026-10-21T12:00:00Z');
  const mirrored=createMarketRateService(async(url,timeout)=>{
    calls.push([url,timeout]);
    if(url===marketRateUrls.nobitex)return nobitex;
    if(url===marketRateUrls.daily)throw new Error('blocked');
    if(url===marketRateUrls.mirror)return daily;
    throw new Error('Coinbase should not be called');
  },now);
  assert.deepEqual((await mirrored()).rates!.fxMeta,{provider:'currency-api',date:daily.date,mirror:'cloudflare'});
  calls.length=0;
  const last=createMarketRateService(async(url,timeout)=>{
    calls.push([url,timeout]);
    if(url===marketRateUrls.nobitex)return nobitex;
    if(url===marketRateUrls.daily)return {...daily,date:'2026-10-18'};
    if(url===marketRateUrls.mirror)return {...daily,usd:{...daily.usd,usdt:null}};
    return coinbase;
  },now);
  const feed=await last();assert.deepEqual(feed.rates!.fxMeta,{provider:'coinbase'});
  assert.deepEqual(calls.filter(([url])=>url!==marketRateUrls.nobitex),[[marketRateUrls.daily,6000],[marketRateUrls.mirror,6000],[marketRateUrls.coinbase,3000]]);
});
test('server FX route is unavailable outside standalone mode before any upstream read',async()=>{
  process.env.ROYA_DEPLOYMENT_ROLE='frontend';
  const result=await GET(new Request('http://localhost/api/shop/rates/'));
  assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');
  process.env.ROYA_DEPLOYMENT_ROLE='standalone';
});
