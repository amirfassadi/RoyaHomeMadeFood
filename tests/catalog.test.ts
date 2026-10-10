import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoCatalog} from '../src/lib/catalog/demo';
import {filterProducts, normalizeSearch} from '../src/lib/catalog/filter';
import {contactSchema} from '../src/lib/validation/contact';
test('catalog search handles Persian/Arabic variants and combines category with query', () => {
  assert.equal(normalizeSearch(' كوكو ي '), 'کوکو ی');
  assert.equal(filterProducts(demoCatalog.products, '', 'كالباس').length, 1);
  assert.equal(filterProducts(demoCatalog.products, 'demo-platters', 'platter').length, 1);
  assert.equal(filterProducts(demoCatalog.products, 'demo-sausages', 'platter').length, 0);
  assert.equal(filterProducts(demoCatalog.products, '', '').length, 4);
});
test('contact input normalizes Persian mobile digits and enforces bounds', () => {
  const data = {name: 'رویا', mobile: '۰۹۱۲۳۴۵۶۷۸۹', message: 'یک پیام آزمایشی برای رویا', locale: 'fa'};
  assert.equal(contactSchema.parse(data).mobile, '09123456789');
  assert.equal(contactSchema.safeParse({...data, message: 'کوتاه'}).success, false);
  assert.equal(contactSchema.safeParse({...data, mobile: '123'}).success, false);
  assert.equal(contactSchema.safeParse({...data, message: 'x'.repeat(3001)}).success, false);
});
