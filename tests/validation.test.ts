import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaSchema, productSchema} from '../src/lib/validation/product';
const product = {
  nameFa: 'غذای نمونه', nameEn: 'Sample food', slug: 'sample-food', categoryId: 'category',
  descriptionFa: 'شرح محصول نمونه برای آزمون', descriptionEn: 'Example product description for testing',
  priceToman: 120000, unit: 'GRAM', priceBasisQuantity: 1000, minOrderQuantity: 500,
  orderStepQuantity: 250, stockQuantity: 0, dailyCapacity: null, preparationMinutes: 120,
  active: true, featured: false,
};
test('product validation accepts weight quantities and rejects fractional piece units', () => {
  assert.equal(productSchema.safeParse(product).success, true);
  assert.equal(productSchema.safeParse({...product, unit: 'PIECE', minOrderQuantity: 0.5}).success, false);
  assert.equal(productSchema.safeParse({...product, orderStepQuantity: 0}).success, false);
  assert.equal(productSchema.safeParse({...product, stockQuantity: -1}).success, false);
});
test('video bytes and Cloudinary origin are validated', () => {
  const media = {type: 'VIDEO', cloudinaryId: 'roya/sample', secureUrl: 'https://res.cloudinary.com/roya/video/upload/sample.mp4', altFa: 'نمونه', altEn: 'Sample', width: 1080, height: 720, bytes: 20_000_000, durationSeconds: 20};
  assert.equal(mediaSchema.safeParse(media).success, true);
  assert.equal(mediaSchema.safeParse({...media, bytes: 20_000_001}).success, false);
  assert.equal(mediaSchema.safeParse({...media, durationSeconds: null}).success, false);
  assert.equal(mediaSchema.safeParse({...media, secureUrl: 'https://res.cloudinary.com.evil.test/file.mp4'}).success, false);
});
