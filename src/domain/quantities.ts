export function assertAvailable(requested: bigint, available: bigint): void {
  if (requested <= 0n || available < 0n || requested > available) throw new Error('QUANTITY_UNAVAILABLE');
}
