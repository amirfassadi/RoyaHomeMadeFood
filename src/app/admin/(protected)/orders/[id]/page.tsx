import {OrderDetail} from '@/components/admin/order-detail';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
import {notFound} from 'next/navigation';
// Always probe a placeholder at build time: live auth/connection opts the route
// into request rendering. An empty list incorrectly creates an ISR fallback.
export function generateStaticParams(){return [{id:'demo-order'}];}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const data=await getAdminData('order',{id});if(!data.detail)notFound();return <OrderDetail initial={data.detail} isDemo={isDemoCatalog()}/>;}
