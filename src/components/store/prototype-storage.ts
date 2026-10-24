'use client';
import {useEffect,useState} from 'react';
import {DEMO_ORDERS_KEY,parseDemoOrders,upsertDemoOrder,type DemoOrder} from '@/lib/prototype';
let memory:DemoOrder[]=[];
export function readDemoOrders(){try{const raw=localStorage.getItem(DEMO_ORDERS_KEY);return raw===null?memory:parseDemoOrders(raw);}catch{return memory;}}
export function saveDemoOrder(order:DemoOrder){memory=upsertDemoOrder(readDemoOrders(),order);try{localStorage.setItem(DEMO_ORDERS_KEY,JSON.stringify(memory));}catch{}window.dispatchEvent(new Event('roya-demo-orders'));}
export function clearDemoOrders(){memory=[];try{localStorage.removeItem(DEMO_ORDERS_KEY);}catch{}window.dispatchEvent(new Event('roya-demo-orders'));}
export function useDemoOrders(){const [orders,setOrders]=useState<DemoOrder[]>([]);useEffect(()=>{const sync=()=>setOrders(readDemoOrders());sync();window.addEventListener('storage',sync);window.addEventListener('roya-demo-orders',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('roya-demo-orders',sync);};},[]);return orders;}
