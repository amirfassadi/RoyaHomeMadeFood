import {OrderDetail} from '@/components/admin/order-detail';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoAdmin} from '@/lib/server/admin-mode';
import {notFound} from 'next/navigation';
export function generateStaticParams(){return isDemoAdmin()?[{id:'demo-order'}]:[];}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const data=await getAdminData('order',{id});if(!data.detail)notFound();return <OrderDetail initial={data.detail} isDemo={isDemoAdmin()}/>;}
