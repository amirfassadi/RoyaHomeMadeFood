import {noAdminAccess,type AdminAccess} from '@/lib/admin/permissions';
import {redirect} from 'next/navigation';
import {connection} from 'next/server';
import {isDemoCatalog} from '@/lib/server/catalog';
import {requireAdmin} from '@/lib/server/auth';
import {ShopError} from '@/lib/server/shop-http';
import {AdminShell} from '@/components/admin/shell';
export default async function Layout({children}:{children:React.ReactNode}){
 const isDemo=isDemoCatalog();let name='نمایش نمونه',access:AdminAccess={...noAdminAccess,adminOwner:isDemo};
 if(!isDemo){await connection();try{const user=await requireAdmin();name=user.name;access={adminOwner:user.adminOwner,adminPermissions:user.adminPermissions,mustChangePassword:user.mustChangePassword};if(user.mustChangePassword)redirect('/admin/security/');}catch(e){if(e instanceof ShopError && e.status===401)redirect('/admin/login/');throw e;}}
 return <AdminShell isDemo={isDemo} name={name} access={access}>{children}</AdminShell>;
}
