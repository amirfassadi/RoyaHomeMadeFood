// These pure rules are used by UI previews now and authoritative checkout later.
// Persist quantities with three decimal places; calculations use scaled integers.
const SCALE = 1000;
function scaled(value: number) {
  const result = Math.round(value * SCALE);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result) || Math.abs(result / SCALE - value) > 1e-8) {
    throw new RangeError('Quantity must have at most three decimals');
  }
  return result;
}
export function validateQuantity(quantity: number, minimum: number, step: number, stock?: number | null) {
  try {
    const q = scaled(quantity), min = scaled(minimum), increment = scaled(step);
    return min > 0 && increment > 0 && q >= min && (q - min) % increment === 0 && (stock == null || q <= scaled(stock));
  } catch { return false; }
}
export function calculateLineTotal(priceToman: number, quantity: number, priceBasisQuantity: number) {
  if (!Number.isSafeInteger(priceToman) || priceToman < 0) throw new RangeError('Invalid price');
  const q = scaled(quantity), basis = scaled(priceBasisQuantity);
  if (q <= 0 || basis <= 0) throw new RangeError('Invalid quantity');
  // Round each line to nearest Toman, half up. Never accept client prices in checkout.
  const result = (BigInt(priceToman) * BigInt(q) + BigInt(Math.floor(basis / 2))) / BigInt(basis);
  if (result > 2147483647n) throw new RangeError('Amount exceeds database integer range');
  return Number(result);
}
export function estimateDelivery(acceptedAt: Date, preparationMinutes: number[], zoneDeliveryMinutes: number) {
  if (!preparationMinutes.length) throw new RangeError('Cart must have items');
  if (!Number.isFinite(acceptedAt.getTime())) throw new RangeError('Invalid date');
  for (const minutes of [...preparationMinutes, zoneDeliveryMinutes]) {
    if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError('Invalid duration');
  }
  return new Date(acceptedAt.getTime() + (Math.max(...preparationMinutes) + zoneDeliveryMinutes) * 60_000);
}
