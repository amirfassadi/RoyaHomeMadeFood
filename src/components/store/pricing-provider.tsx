'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {defaultPricingPolicy,marketRatesSchema,pricingPolicySchema,ratesFresh,sampleMarketRates,type MarketRates,type PricingPolicy} from '@/lib/pricing';
import {newerPolicy,PricingSaveError,storePolicyResponseSchema} from '@/lib/pricing-store';
import {fetchMarketRates} from '@/lib/fx-rates';
import {fetchStoreMarketFeed,type MarketFeed} from '@/lib/market-feed';
const POLICY_KEY='roya-pricing-policy-v1',VERSION_KEY='roya-store-policy-version-v1',RATES_KEY='roya-market-rates-v1',EVENT='roya-pricing-policy-change';
type PricingContext={rates:MarketRates|null;feed:MarketFeed|null;policy:PricingPolicy;ready:boolean;loading:boolean;error:boolean;policyError:boolean;stale:boolean;refresh:()=>Promise<void>;refreshPolicy:()=>Promise<void>;useSampleRates:()=>void;savePolicy:(p:PricingPolicy,expectedUpdatedAt:string)=>Promise<void>};
const Context=createContext<PricingContext|null>(null);
export function PricingProvider({children,mode='local',initialPolicy}:{children:ReactNode;mode?:'local'|'store';initialPolicy?:PricingPolicy}){
  const [rates,setRates]=useState<MarketRates|null>(null),[policy,setPolicy]=useState<PricingPolicy>(initialPolicy??defaultPricingPolicy);
  const [feed,setFeed]=useState<MarketFeed|null>(null);
  const [ready,setReady]=useState(!!initialPolicy),[loading,setLoading]=useState(false),[error,setError]=useState(false),[policyError,setPolicyError]=useState(false),[clock,setClock]=useState(0);
  const busy=useRef(false),pendingPolicy=useRef<Promise<void>|null>(null),alive=useRef(true),policyGeneration=useRef(0);
  const rateGeneration=useRef(0),sampleMode=useRef(false);
  const refreshPolicy=useCallback(async()=>{
    if(mode!=='store')return;
    if(pendingPolicy.current)return pendingPolicy.current;
    const generation=policyGeneration.current;
    const task=(async()=>{
      try{
        const response=await fetch('/api/shop/pricing/',{cache:'no-store',signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Unavailable');
        const value=storePolicyResponseSchema.parse(await response.json());
        if(alive.current&&generation===policyGeneration.current){setPolicy(current=>newerPolicy(current,value.policy));setReady(true);setPolicyError(false);}
      }catch{if(alive.current&&generation===policyGeneration.current){setReady(false);setPolicyError(true);}}
    })();
    pendingPolicy.current=task;
    try{await task;}finally{if(pendingPolicy.current===task)pendingPolicy.current=null;}
  },[mode]);
  const refresh=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setLoading(true);setError(false);
    if(sampleMode.current){setRates(null);setFeed(null);}
    sampleMode.current=false;
    const generation=++rateGeneration.current;
    try{
      let next:MarketRates|null;
      if(mode==='store'){
        const value=await fetchStoreMarketFeed();
        if(!alive.current||generation!==rateGeneration.current)return;
        setFeed(value);next=value.rates;
        setError(Object.values(value.sources).some(source=>source.refreshFailed||source.state!=='fresh'));
      }else next=await fetchMarketRates();
      if(!alive.current||generation!==rateGeneration.current)return;
      // A restarted server may have only one source. Keep the browser's last
      // complete live snapshot at its original age, never relabel a sample live.
      setRates(current=>next??(current?.sample?null:current));setClock(Date.now());
      if(next&&!next.sample)try{localStorage.setItem(RATES_KEY,JSON.stringify(next));}catch{}
    }catch{if(alive.current&&generation===rateGeneration.current)setError(true);}finally{if(alive.current)setLoading(false);busy.current=false;}
  },[mode]);
  useEffect(()=>{
    alive.current=true;
    function readLocal(){try{const p=pricingPolicySchema.safeParse(JSON.parse(localStorage.getItem(POLICY_KEY)??'null'));setPolicy(p.success?p.data:defaultPricingPolicy);}catch{setPolicy(defaultPricingPolicy);}setReady(true);}
    if(mode==='store')void refreshPolicy();else readLocal();
    let cached:MarketRates|null=null;
    try{const p=marketRatesSchema.safeParse(JSON.parse(localStorage.getItem(RATES_KEY)??'null'));if(p.success&&!p.data.sample){cached=p.data;setRates(cached);}else if(p.success&&p.data.sample){localStorage.removeItem(RATES_KEY);}}catch{}
    sampleMode.current=false;
    setClock(Date.now());
    if(!cached||!ratesFresh(cached)||Date.now()-Date.parse(cached.fetchedAt)>60000||mode==='store')void refresh();
    const timer=setInterval(()=>{setClock(Date.now());},10000),auto=setInterval(()=>{if(!sampleMode.current)void refresh();},mode==='store'?60000:5*60*1000);
    const policyTimer=mode==='store'?setInterval(()=>{void refreshPolicy();},60000):null;
    const changed=()=>{if(mode==='store')void refreshPolicy();else readLocal();};
    const storage=(event:StorageEvent)=>{if(event.key===(mode==='store'?VERSION_KEY:POLICY_KEY))changed();};
    window.addEventListener('storage',storage);window.addEventListener(EVENT,changed);window.addEventListener('focus',changed);
    return()=>{alive.current=false;clearInterval(timer);clearInterval(auto);if(policyTimer)clearInterval(policyTimer);window.removeEventListener('storage',storage);window.removeEventListener(EVENT,changed);window.removeEventListener('focus',changed);};
  },[mode,refresh,refreshPolicy]);
  async function savePolicy(next:PricingPolicy,expectedUpdatedAt:string){
    if(mode==='local'){
      const valid=pricingPolicySchema.parse({...next,updatedAt:new Date().toISOString()});
      localStorage.setItem(POLICY_KEY,JSON.stringify(valid));setPolicy(valid);window.dispatchEvent(new Event(EVENT));return;
    }
    const {updatedAt:_,...editable}=pricingPolicySchema.parse(next);
    policyGeneration.current++;pendingPolicy.current=null;
    let response:Response;
    try{response=await fetch('/api/admin/settings/pricing/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:editable,expectedUpdatedAt}),signal:AbortSignal.timeout(15000)});}
    catch{setReady(false);setPolicyError(true);throw new PricingSaveError('UNCERTAIN');}
    if(response.status===409)throw new PricingSaveError('CONFLICT');
    if(response.status===401)throw new PricingSaveError('UNAUTHORIZED');
    try{
      if(!response.ok)throw new Error('Unavailable');
      const value=storePolicyResponseSchema.parse(await response.json());
      if(Date.parse(value.policy.updatedAt)<=Date.parse(expectedUpdatedAt))throw new Error('Invalid version');
      setPolicy(current=>newerPolicy(current,value.policy));setReady(true);setPolicyError(false);
      try{localStorage.setItem(VERSION_KEY,value.policy.updatedAt);}catch{}
      window.dispatchEvent(new Event(EVENT));
    }catch{setReady(false);setPolicyError(true);throw new PricingSaveError('UNCERTAIN');}
  }
  function useSampleRates(){
    rateGeneration.current++;sampleMode.current=true;
    const next=sampleMarketRates();setFeed(null);setRates(next);setClock(Date.now());setError(false);
    // Fictional rates belong only to this mounted test screen. Keep the last
    // real cache intact, and always return to providers on reload/navigation.
  }
  return <Context.Provider value={{rates,feed,policy,ready,loading,error,policyError,stale:!!rates&&!ratesFresh(rates,clock||Date.now()),refresh,refreshPolicy,useSampleRates,savePolicy}}>{children}</Context.Provider>;
}
export function usePricing(){const context=useContext(Context);if(!context)throw new Error('PricingProvider required');return context;}
