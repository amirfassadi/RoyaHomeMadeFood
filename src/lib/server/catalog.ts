import 'server-only';
import {unstable_cache} from 'next/cache';
import {getDb} from './db';
import {demoCatalog} from '@/lib/catalog/demo';
import type {CatalogView} from '@/lib/catalog/types';
export function isDemoCatalog() {return process.env.SITES_STATIC_PREVIEW === '1' || process.env.ROYA_DEMO_CATALOG === '1';}
const readDatabaseCatalog = unstable_cache(async (): Promise<CatalogView> => {
  const db = getDb();
  const [categories, products] = await Promise.all([
    db.category.findMany({where: {active: true}, orderBy: {sortOrder: 'asc'}, select: {id: true, slug: true, nameFa: true, nameEn: true}}),
    db.product.findMany({where: {active: true, category: {active: true}}, orderBy: [{featured: 'desc'}, {createdAt: 'desc'}], include: {media: {orderBy: {sortOrder: 'asc'}}}}),
  ]);
  return {categories, isDemo: false, products: products.map(p => ({
    id: p.id, slug: p.slug, nameFa: p.nameFa, nameEn: p.nameEn, descriptionFa: p.descriptionFa, descriptionEn: p.descriptionEn,
    categoryId: p.categoryId, priceToman: p.priceToman, unit: p.unit,
    priceBasisQuantity: Number(p.priceBasisQuantity), minOrderQuantity: Number(p.minOrderQuantity), orderStepQuantity: Number(p.orderStepQuantity),
    stockQuantity: p.stockQuantity == null ? null : Number(p.stockQuantity), dailyCapacity: p.dailyCapacity == null ? null : Number(p.dailyCapacity),
    preparationMinutes: p.preparationMinutes, featured: p.featured,
    media: p.media.map(m => ({id: m.id, type: m.type, url: m.secureUrl, altFa: m.altFa, altEn: m.altEn, width: m.width, height: m.height})),
  }))};
}, ['roya-catalog-v2'], {revalidate: 60, tags: ['catalog']});
export async function getCatalog(): Promise<CatalogView> {
  if (isDemoCatalog()) return demoCatalog;
  // No accidental demo products in a real storefront. Missing setup shows a truthful empty catalog.
  if (!process.env.DATABASE_URL) return {categories: [], products: [], isDemo: false};
  return readDatabaseCatalog();
}
