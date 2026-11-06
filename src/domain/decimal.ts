export function validateScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) throw new Error('INVALID_SCALE');
}
export function decimalParts(value: string): { units: bigint; scale: number } {
  if (value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('INVALID_DECIMAL');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 8) throw new Error('DECIMAL_PRECISION');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
export function parseDecimal(value: string, scale: number): bigint {
  validateScale(scale);
  const parsed = decimalParts(value);
  if (parsed.scale > scale) throw new Error('DECIMAL_PRECISION');
  return parsed.units * 10n ** BigInt(scale - parsed.scale);
}
