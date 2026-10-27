import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsEditor} from '../../src/components/admin/settings-editor';
import {emptyData,type AdminData} from '../../src/lib/admin/types';
function Fixture(){
 const [data,setData]=useState<AdminData|null>(null);
 const refresh=()=>{void fetch('/fixture/settings').then(r=>r.json()).then(value=>setData({...emptyData(),...value}));};
 useEffect(refresh,[]);
 return <main className="mx-auto max-w-5xl p-4" dir="rtl">{data?<SettingsEditor data={data} isDemo={new URLSearchParams(location.search).has('demo')} refresh={refresh}/>:<p>Loading fixture</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
