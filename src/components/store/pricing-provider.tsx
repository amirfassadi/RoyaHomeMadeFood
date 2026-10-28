'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {defaultPricingPolicy,marketRatesSchema,pricingPolicySchema,ratesFresh,sampleMarketRates,type MarketRates,type PricingPolicy} from '@/lib/pricing';
import {fetchMarketRates} from '@/lib/fx-rates';

const POLICY_KEY='roya-pricing-policy-v1',RATES_KEY='roya-market-rates-v1',EVENT='roya-pricing-policy-change';
type PricingContext={rates:MarketRates|null;policy:PricingPolicy;ready:boolean;loading:boolean;error:boolean;stale:boolean;refresh:()=>Promise<void>;useSampleRates:()=>void;savePolicy:(p:PricingPolicy)=>void};
const Context=createContext<PricingContext|null>(null);
let pending:Promise<MarketRates>|null=null;
export function PricingProvider({children}:{children:ReactNode}){
  const [rates,setRates]=useState<MarketRates|null>(null),[policy,setPolicy]=useState<PricingPolicy>(defaultPricingPolicy);
  const [ready,setReady]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[clock,setClock]=useState(0);
  const busy=useRef(false);
  const refresh=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setLoading(true);setError(false);
    try{
      pending??=fetchMarketRates().finally(()=>{pending=null;});
      const next=await pending;setRates(next);setClock(Date.now());
      try{localStorage.setItem(RATES_KEY,JSON.stringify(next));}catch{}
    }catch{setError(true);}finally{setLoading(false);busy.current=false;}
  },[]);
  useEffect(()=>{
    function readPolicy(){try{const p=pricingPolicySchema.safeParse(JSON.parse(localStorage.getItem(POLICY_KEY)??'null'));setPolicy(p.success?p.data:defaultPricingPolicy);}catch{setPolicy(defaultPricingPolicy);}}
    readPolicy();let cached:MarketRates|null=null;
    try{const p=marketRatesSchema.safeParse(JSON.parse(localStorage.getItem(RATES_KEY)??'null'));if(p.success){cached=p.data;setRates(cached);}}catch{}
    setReady(true);setClock(Date.now());
    if(!cached||!ratesFresh(cached)||Date.now()-Date.parse(cached.fetchedAt)>60000)void refresh();
    const timer=setInterval(()=>{setClock(Date.now());},10000);
    const auto=setInterval(()=>{void refresh();},5*60*1000);
    const storage=(event:StorageEvent)=>{if(event.key===POLICY_KEY)readPolicy();};
    window.addEventListener('storage',storage);window.addEventListener(EVENT,readPolicy);
    return()=>{clearInterval(timer);clearInterval(auto);window.removeEventListener('storage',storage);window.removeEventListener(EVENT,readPolicy);};
  },[refresh]);
  function savePolicy(next:PricingPolicy){
    const valid=pricingPolicySchema.parse({...next,updatedAt:new Date().toISOString()});
    localStorage.setItem(POLICY_KEY,JSON.stringify(valid));setPolicy(valid);window.dispatchEvent(new Event(EVENT));
  }
  function useSampleRates(){
    const next=sampleMarketRates();setRates(next);setClock(Date.now());setError(false);
    try{localStorage.setItem(RATES_KEY,JSON.stringify(next));}catch{}
  }
  return <Context.Provider value={{rates,policy,ready,loading,error,stale:!!rates&&!ratesFresh(rates,clock||Date.now()),refresh,useSampleRates,savePolicy}}>{children}</Context.Provider>;
}
export function usePricing(){const context=useContext(Context);if(!context)throw new Error('PricingProvider required');return context;}
