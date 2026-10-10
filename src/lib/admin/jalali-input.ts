import {toLatinDigits} from '@/lib/format';
const formatter=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(date:Date){const a=formatter.formatToParts(date);return Object.fromEntries(a.map(p=>[p.type,p.value]));}
export function jalaliInput(iso:string|null){if(!iso)return '';const p=parts(new Date(iso));return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);}
export function parseJalaliInput(input:string):string|null{
 if(!input.trim())return null;
 const match=toLatinDigits(input).trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
 if(!match)throw new RangeError('تاریخ شمسی را به شکل ۱۴۰۵/۰۷/۲۰ ۱۰:۳۰ وارد کنید.');
 const [year,month,day,hour,minute]=match.slice(1).map(Number);
 if(year<1402 || year>1499 || month<1 || month>12 || day<1 || day>31 || hour>23 || minute>59)throw new RangeError('تاریخ شمسی معتبر نیست.');
 // Intl is the calendar authority; invalid leap days fail a full round trip.
 const start=Date.UTC(year+621,0,1,12);
 for(let i=0;i<450;i++){
  const date=new Date(start+i*86400000),p=parts(date);
  if(Number(p.year)===year && Number(p.month)===month && Number(p.day)===day){
   const result=new Date(`${date.toISOString().slice(0,10)}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+03:30`),check=parts(result);
   if(Number(check.year)!==year || Number(check.month)!==month || Number(check.day)!==day || Number(check.hour)!==hour || Number(check.minute)!==minute)break;
   return result.toISOString();
  }
 }
 throw new RangeError('تاریخ شمسی معتبر نیست.');
}
