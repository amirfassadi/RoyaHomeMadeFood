export type CategoryView = {id: string; slug: string; nameFa: string; nameEn: string};
export type MediaView = {id: string; type: 'IMAGE' | 'VIDEO'; url: string; altFa: string; altEn: string; width: number; height: number};
export type ProductView = {
  id: string; slug: string; nameFa: string; nameEn: string; descriptionFa: string; descriptionEn: string;
  categoryId: string; priceToman: number; unit: 'KG' | 'GRAM' | 'PIECE' | 'PACK';
  priceBasisQuantity: number; minOrderQuantity: number; orderStepQuantity: number;
  stockQuantity: number | null; dailyCapacity: number | null; preparationMinutes: number; featured: boolean;
  media: MediaView[];
};
export type CatalogView = {products: ProductView[]; categories: CategoryView[]; isDemo: boolean; source?:'sample'|'database'};
