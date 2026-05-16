/**
 * Detect Prisma errors when a model's table has not been migrated yet (staging drift).
 */
export function isPrismaMissingTableError(err) {
  const msg = err?.message || String(err || '');
  return msg.includes('does not exist') || err?.code === 'P2021';
}
