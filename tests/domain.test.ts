import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateLineTotal, estimateDelivery, validateQuantity} from '../src/lib/domain/order';
import {formatDate, formatToman, toLatinDigits} from '../src/lib/format';

test('minimum-anchored steps, fractional kilograms and stock bounds', () => {
  assert.equal(validateQuantity(500, 500, 250), true);
  assert.equal(validateQuantity(750, 500, 250), true);
  assert.equal(validateQuantity(600, 500, 250), false);
  assert.equal(validateQuantity(250, 500, 250), false);
  assert.equal(validateQuantity(1000, 500, 250, 750), false);
  assert.equal(validateQuantity(0.75, 0.5, 0.25), true);
  assert.equal(validateQuantity(NaN, 500, 250), false);
  assert.equal(validateQuantity(0.0001, 0.0001, 0.0001), false);
});
test('line totals use integer Toman, price basis and half-up rounding', () => {
  assert.equal(calculateLineTotal(120000, 500, 1000), 60000);
  assert.equal(calculateLineTotal(120000, 750, 1000), 90000);
  assert.equal(calculateLineTotal(120000, 0.75, 1), 90000);
  assert.equal(calculateLineTotal(3, 0.5, 1), 2);
  assert.throws(() => calculateLineTotal(-1, 1, 1));
  assert.throws(() => calculateLineTotal(2147483647, 2, 1));
});
test('delivery uses maximum preparation, not sum, and rejects invalid carts', () => {
  const accepted = new Date('2026-10-10T10:00:00Z');
  assert.equal(estimateDelivery(accepted, [120, 240], 60).toISOString(), '2026-10-10T15:00:00.000Z');
  assert.throws(() => estimateDelivery(accepted, [], 60));
  assert.throws(() => estimateDelivery(accepted, [120], -1));
});
test('Persian digits, Toman separators, Jalali dates and English locale', () => {
  assert.equal(formatToman(120000), '۱۲۰٬۰۰۰ تومان');
  assert.equal(formatToman(120000, 'en'), '120,000 Toman');
  assert.equal(toLatinDigits('۰۹۱٢۳۴۵۶۷۸۹'), '09123456789');
  assert.match(formatDate('2026-10-10T12:00:00Z'), /۱۴۰۵/);
});
