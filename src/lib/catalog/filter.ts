import type {ProductView} from './types';
export function normalizeSearch(value: string) {
  return value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670\u200c\u200d]/g, '').toLocaleLowerCase().trim();
}
export function filterProducts(products: ProductView[], category: string, query: string) {
  const needle = normalizeSearch(query);
  return products.filter(p => (!category || p.categoryId === category) && normalizeSearch(`${p.nameFa} ${p.nameEn} ${p.descriptionFa} ${p.descriptionEn}`).includes(needle));
}
