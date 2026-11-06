import { decimalParts, validateScale } from './decimal';
export function lineAmountMinor(quantity: string, unitPrice: string, currencyScale: number): bigint {
  validateScale(currencyScale);
  const q = decimalParts(quantity), p = decimalParts(unitPrice);
  const product = q.units * p.units;
  const shift = q.scale + p.scale - currencyScale;
  if (shift <= 0) return product * 10n ** BigInt(-shift);
  const divisor = 10n ** BigInt(shift);
  return (product + divisor / 2n) / divisor;
}
export function formatMinor(value: bigint, scale: number): string {
  validateScale(scale);
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, '0');
  return sign + (scale === 0 ? digits : digits.slice(0, -scale) + '.' + digits.slice(-scale));
}
