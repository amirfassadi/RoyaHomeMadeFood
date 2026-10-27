import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaSchema, productSchema} from '../src/lib/validation/product';
import {quoteSchema} from '../src/lib/validation/checkout';
import {productEditSchema} from '../src/lib/validation/admin';
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
test('checkout collection bounds reject oversized invalid items with a bounded error', () => {
  const items=Array.from({length:30},(_,i)=>({productId:'product-'+i,quantity:1}));
  assert.equal(quoteSchema.safeParse({items,zoneId:'zone'}).success,true);
  for(const length of [31,1000]){
    const result=quoteSchema.safeParse({items:Array(length).fill(null),zoneId:'zone'});
    assert.equal(result.success,false);
    if(!result.success){
      assert.equal(result.error.issues.length,1);
      assert.equal(result.error.issues[0].code,'too_big');
      assert.deepEqual(result.error.issues[0].path,['items']);
    }
  }
});
test('administrator media bounds reject oversized invalid collections and preserve valid edits', () => {
  const media=Array.from({length:10},(_,i)=>({id:'media-'+i,altFa:'تصویر نمونه',altEn:'Sample image'}));
  assert.equal(productEditSchema.safeParse({product,media}).success,true);
  for(const length of [11,1000]){
    const result=productEditSchema.safeParse({product,media:Array(length).fill(null)});
    assert.equal(result.success,false);
    if(!result.success){
      assert.equal(result.error.issues.length,1);
      assert.equal(result.error.issues[0].code,'too_big');
      assert.deepEqual(result.error.issues[0].path,['media']);
    }
  }
});
