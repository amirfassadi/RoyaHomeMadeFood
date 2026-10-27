import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProductEditor} from '../../src/components/admin/product-editor';
import type {AdminProduct} from '../../src/lib/admin/types';

// Local isolated form fixture. It never authenticates or reaches a real catalog.
const minutes=Number(new URLSearchParams(location.search).get('minutes')??240);
const product:AdminProduct={id:'duration-fixture',updatedAt:'2026-10-23T00:00:00.000Z',
 nameFa:'محصول آزمایشی زمان آماده‌سازی',nameEn:'Preparation test fixture',slug:'preparation-fixture',
 categoryId:'fixture-category',descriptionFa:'صرفاً برای آزمایش فرم محصول',descriptionEn:'Isolated product form fixture only',
 priceToman:1500000,unit:'KG',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,
 stockQuantity:null,dailyCapacity:null,preparationMinutes:minutes,active:false,featured:false,media:[]};
function Fixture(){
 const [saved,setSaved]=useState(false);
 return <main style={{maxWidth:1000,margin:'auto',padding:16}} dir="rtl">
  <ProductEditor product={product} categories={[{id:'fixture-category',nameFa:'دستهٔ آزمایشی'}]} isDemo={false} onClose={()=>{}} onSaved={()=>setSaved(true)}/>
  {saved&&<p role="status">FIXTURE_SAVED</p>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
