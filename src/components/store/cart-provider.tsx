'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import type {CatalogView} from '@/lib/catalog/types';
import {validateQuantity} from '@/lib/domain/order';
export type CartItem={productId:string;quantity:number};
type Cart={catalog:CatalogView;items:CartItem[];ready:boolean;add:(id:string,quantity:number)=>boolean;setQuantity:(id:string,quantity:number)=>void;remove:(id:string)=>void;clear:()=>void};
const Context=createContext<Cart|null>(null);
export function CartProvider({catalog,children}:{catalog:CatalogView;children:ReactNode}){
 const key=`roya-cart-v1-${catalog.isDemo?'demo':'live'}`;
 const [items,setItems]=useState<CartItem[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{
   try{const data:unknown=JSON.parse(localStorage.getItem(key)??'[]');if(Array.isArray(data))setItems(data.slice(0,30).filter((i):i is CartItem=>i && typeof i.productId==='string' && typeof i.quantity==='number' && Number.isFinite(i.quantity) && i.quantity>0 && i.quantity<=1000000).filter((i,n,a)=>a.findIndex(v=>v.productId===i.productId)===n));}catch{/* Storage may be disabled; keep a usable in-memory cart. */}
   setReady(true);
 },[key]);
 useEffect(()=>{if(ready)try{localStorage.setItem(key,JSON.stringify(items));}catch{}},[items,key,ready]);
 function valid(id:string,q:number){const p=catalog.products.find(p=>p.id===id);if(!p)return false;const limits=[p.stockQuantity,p.dailyCapacity].filter((n):n is number=>n!==null);return validateQuantity(q,p.minOrderQuantity,p.orderStepQuantity,limits.length?Math.min(...limits):null);}
 const add=(id:string,quantity:number)=>{
   const existing=items.find(i=>i.productId===id),next=(existing?.quantity??0)+quantity;
   if(!ready || (!existing && items.length>=30) || !valid(id,next))return false;
   setItems(a=>existing?a.map(i=>i.productId===id?{...i,quantity:next}:i):[...a,{productId:id,quantity}]);return true;
 };
 return <Context.Provider value={{catalog,items,ready,add,setQuantity:(id,q)=>{if(valid(id,q))setItems(a=>a.map(i=>i.productId===id?{...i,quantity:q}:i));},remove:id=>setItems(a=>a.filter(i=>i.productId!==id)),clear:()=>setItems([])}}>{children}</Context.Provider>;
}
export function useCart(){const c=useContext(Context);if(!c)throw new Error('CartProvider is required');return c;}
