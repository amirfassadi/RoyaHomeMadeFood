'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,CircleMarker} from 'leaflet';
import {Button} from './button';

export type MapLocation={lat:number;lng:number};
export function LocationPicker({value,onChange,disabled=false,locale='fa',label}:{value:MapLocation|null;onChange:(value:MapLocation)=>void;disabled?:boolean;locale?:string;label?:string}){
 const host=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),marker=useRef<CircleMarker|null>(null);
 const callback=useRef(onChange),locked=useRef(disabled),[error,setError]=useState(''),[locating,setLocating]=useState(false),[ready,setReady]=useState(false);
 const fa=locale==='fa';
 useEffect(()=>{callback.current=onChange;locked.current=disabled;},[onChange,disabled]);
 useEffect(()=>{
  let disposed=false;
  import('leaflet').then(L=>{
   if(disposed||!host.current)return;
   const instance=L.map(host.current,{scrollWheelZoom:false}).setView([35.7,51.4],12);
   map.current=instance;
   let failed=0;
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'})
    .on('tileerror',()=>{if(++failed>=3)setError(fa?'نقشه بارگیری نشد؛ اتصال اینترنت را بررسی کنید یا از موقعیت فعلی استفاده کنید.':'Map tiles could not load. Check your connection or use your current location.');})
    .addTo(instance);
   instance.on('click',event=>{if(!locked.current)callback.current({lat:Number(event.latlng.lat.toFixed(6)),lng:Number(event.latlng.lng.toFixed(6))});});
   setReady(true);
  }).catch(()=>setError(fa?'بارگیری نقشه ممکن نشد.':'Could not load the map.'));
  return()=>{disposed=true;map.current?.remove();map.current=null;marker.current=null;};
 },[fa]);
 useEffect(()=>{
  if(!ready||!map.current||!value)return;
  let disposed=false;
  import('leaflet').then(L=>{
   if(disposed||!map.current)return;
   if(marker.current)marker.current.setLatLng([value.lat,value.lng]);
   else marker.current=L.circleMarker([value.lat,value.lng],{radius:10,color:'#2B2B2B',fillColor:'#4A7C59',fillOpacity:1,weight:3}).addTo(map.current);
   map.current.setView([value.lat,value.lng],Math.max(map.current.getZoom(),16));
  });
  return()=>{disposed=true;};
 },[ready,value]);
 function locate(){
  if(disabled)return;
  if(!navigator.geolocation){setError(fa?'موقعیت‌یابی در دسترس نیست؛ محل را روی نقشه انتخاب کنید.':'Geolocation unavailable; select on the map.');return;}
  setLocating(true);setError('');
  navigator.geolocation.getCurrentPosition(position=>{setLocating(false);if(!locked.current)callback.current({lat:Number(position.coords.latitude.toFixed(6)),lng:Number(position.coords.longitude.toFixed(6))});},()=>{setLocating(false);setError(fa?'دسترسی به موقعیت ممکن نشد؛ روی نقشه انتخاب کنید.':'Location access failed; select on the map.');},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
 }
 return <div className="grid gap-3"><p className="text-sm font-bold">{label??(fa?'محل دقیق تحویل روی نقشه':'Delivery location on map')}</p><p className="text-xs leading-6 text-roya-muted">{fa?'نقشه را جابه‌جا کنید و روی محل دقیق تحویل بزنید. نشانی، پلاک و واحد را نیز در کادر آدرس بنویسید.':'Move the map and tap the delivery point. Also enter the street address and unit.'}</p><div className="relative isolate"><div ref={host} dir="ltr" role="region" aria-label={label??(fa?'نقشه انتخاب موقعیت':'Location map')} aria-disabled={disabled} className="h-72 w-full rounded-xl border border-roya-line"/>{disabled&&<div className="absolute inset-0 z-[1000] rounded-xl bg-white/30"/>}</div><div className="flex flex-wrap items-center gap-3"><Button type="button" variant="secondary" disabled={disabled||locating} onClick={locate}>{locating?(fa?'در حال موقعیت‌یابی…':'Locating…'):(fa?'استفاده از موقعیت فعلی':'Use my current location')}</Button><span role="status" className="text-xs text-roya-green">{value?(fa?'موقعیت انتخاب شد':'Location selected'):(fa?'هنوز موقعیتی انتخاب نشده':'No location selected')}</span></div>{error&&<p role="alert" className="text-sm text-roya-brown">{error}</p>}<details className="text-xs"><summary className="cursor-pointer py-2">{fa?'ورود مختصات به‌صورت دستی':'Enter coordinates manually'}</summary><div className="mt-2 grid grid-cols-2 gap-3">{(['lat','lng'] as const).map((key,index)=><label key={key} className="grid gap-2">{fa?(index?'طول جغرافیایی':'عرض جغرافیایی'):(index?'Longitude':'Latitude')}<input type="number" step="any" min={index?-180:-90} max={index?180:90} dir="ltr" disabled={disabled} value={value?.[key]??''} className="min-h-11 rounded-lg border p-2" onChange={e=>{if(!e.target.value)return;const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=(index?180:90))onChange({...value??{lat:35.7,lng:51.4},[key]:n});}}/></label>)}</div></details></div>;
}
