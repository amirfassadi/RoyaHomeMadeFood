'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {cartStorageKey,privateCatalogResponseSchema} from '@/lib/catalog/snapshot';
import type {CatalogView} from '@/lib/catalog/types';
import {validateQuantity} from '@/lib/domain/order';
export type CartItem={productId:string;quantity:number};
type Cart={catalog:CatalogView;items:CartItem[];ready:boolean;catalogLoading:boolean;catalogError:boolean;refreshCatalog:()=>Promise<CatalogView>;add:(id:string,quantity:number)=>boolean;setQuantity:(id:string,quantity:number)=>void;remove:(id:string)=>void;clear:()=>void};
const Context=createContext<Cart|null>(null);
export function CartProvider({catalog:initialCatalog,children}:{catalog:CatalogView;children:ReactNode}){
 const router=useRouter(),[catalog,setCatalog]=useState(initialCatalog),[catalogLoading,setCatalogLoading]=useState(false),[catalogError,setCatalogError]=useState(false);
 const latest=useRef(initialCatalog),pending=useRef<Promise<CatalogView>|null>(null),alive=useRef(true);
 const databasePreview=initialCatalog.isDemo&&initialCatalog.source==='database';
 useEffect(()=>{latest.current=initialCatalog;setCatalog(initialCatalog);},[initialCatalog]);
 const refreshCatalog=useCallback(async()=>{
  if(!databasePreview)return latest.current;
  if(pending.current)return pending.current;
  setCatalogLoading(true);
  const task=(async()=>{
   try{
    const response=await fetch('/api/shop/catalog/',{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('CATALOG_UNAVAILABLE');
    const value=privateCatalogResponseSchema.parse(await response.json()).catalog;
    if(alive.current){latest.current=value;setCatalog(value);setCatalogError(false);}
    return value;
   }catch{if(alive.current)setCatalogError(true);throw new Error('CATALOG_UNAVAILABLE');}
   finally{if(alive.current)setCatalogLoading(false);}
  })();
  pending.current=task;try{return await task;}finally{if(pending.current===task)pending.current=null;}
 },[databasePreview]);
 useEffect(()=>{
  alive.current=true;
  if(!databasePreview)return()=>{alive.current=false;};
  const refresh=()=>{void refreshCatalog().catch(()=>{});};
  const focus=()=>{refresh();router.refresh();};
  refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',focus);
  return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',focus);};
 },[databasePreview,refreshCatalog,router]);
 const key=cartStorageKey(catalog);
 const [items,setItems]=useState<CartItem[]>([]),[loadedKey,setLoadedKey]=useState<string|null>(null),ready=loadedKey===key;
 useEffect(()=>{
   try{const data:unknown=JSON.parse(localStorage.getItem(key)??'[]');if(Array.isArray(data))setItems(data.slice(0,30).filter((i):i is CartItem=>i && typeof i.productId==='string' && typeof i.quantity==='number' && Number.isFinite(i.quantity) && i.quantity>0 && i.quantity<=1000000).filter((i,n,a)=>a.findIndex(v=>v.productId===i.productId)===n));}catch{/* Storage may be disabled; keep a usable in-memory cart. */}
   setLoadedKey(key);
 },[key]);
 useEffect(()=>{if(ready)try{localStorage.setItem(key,JSON.stringify(items));}catch{}},[items,key,ready]);
 function valid(id:string,q:number){const p=catalog.products.find(p=>p.id===id);if(!p)return false;const limits=[p.stockQuantity,p.dailyCapacity].filter((n):n is number=>n!==null);return validateQuantity(q,p.minOrderQuantity,p.orderStepQuantity,limits.length?Math.min(...limits):null);}
 const add=(id:string,quantity:number)=>{
   const existing=items.find(i=>i.productId===id),next=(existing?.quantity??0)+quantity;
   if(!ready || catalogError || catalogLoading || (!existing && items.length>=30) || !valid(id,next))return false;
   setItems(a=>existing?a.map(i=>i.productId===id?{...i,quantity:next}:i):[...a,{productId:id,quantity}]);return true;
 };
 return <Context.Provider value={{catalog,items,ready,catalogLoading,catalogError,refreshCatalog,add,setQuantity:(id,q)=>{if(valid(id,q))setItems(a=>a.map(i=>i.productId===id?{...i,quantity:q}:i));},remove:id=>setItems(a=>a.filter(i=>i.productId!==id)),clear:()=>setItems([])}}>{children}</Context.Provider>;
}
export function useCart(){const c=useContext(Context);if(!c)throw new Error('CartProvider is required');return c;}
