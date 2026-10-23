'use client';
import {useId,useState} from 'react';
import {Field,fieldClass} from './shared';

const units={day:{label:'روز',minutes:1440},hour:{label:'ساعت',minutes:60},minute:{label:'دقیقه',minutes:1}} as const;
type Unit=keyof typeof units;
function initialUnit(minutes:number):Unit{
 if(minutes>0&&minutes%1440===0)return 'day';
 if(minutes>0&&minutes%60===0)return 'hour';
 return 'minute';
}
export function PreparationTimeInput({minutes,onChange}:{minutes:number;onChange:(minutes:number)=>void}){
 const [unit,setUnit]=useState<Unit>(()=>initialUnit(minutes)),id=useId();
 const factor=units[unit].minutes,amount=Number.isFinite(minutes)?minutes/factor:'';
 const valid=Number.isSafeInteger(minutes)&&minutes>=0&&minutes<=525600;
 return <div className="grid gap-2 text-sm sm:col-span-2">
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
   <Field label="زمان آماده‌سازی" type="number" min={0} max={525600/factor} step="any" required
    value={amount} aria-describedby={id} onChange={e=>{
     const converted=e.target.valueAsNumber*factor,whole=Math.round(converted);
     // Remove floating-point noise (4.1 hours -> 246 minutes), not partial minutes.
     onChange(Math.abs(converted-whole)<1e-7?whole:converted);
    }}/>
   <label className="grid gap-2">واحد زمان آماده‌سازی
    <select className={fieldClass} value={unit} onChange={e=>setUnit(e.target.value as Unit)}>
     {Object.entries(units).map(([value,item])=><option key={value} value={value}>{item.label}</option>)}
    </select>
   </label>
  </div>
  <p id={id} role="status" className="text-xs leading-6 text-roya-muted">
   {valid?minutes===0?'بدون زمان آماده‌سازی':`زمان آماده‌سازی: ${new Intl.NumberFormat('fa-IR').format(Number(amount))} ${units[unit].label}؛ معادل ${new Intl.NumberFormat('fa-IR').format(minutes)} دقیقه.`:'زمان آماده‌سازی معتبر را وارد کنید.'}
   {' '}برای زمان‌های جزئی، واحد کوچک‌تر را انتخاب کنید.
  </p>
 </div>;
}
