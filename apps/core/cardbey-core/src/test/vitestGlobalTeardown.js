/**
 * Runs once after all Vitest workers complete.
 * Stops scheduler noise and disconnects the shared Prisma client to avoid Rust/N-API shutdown panics on Windows.
 */
export default async function vitestGlobalTeardown() {
  try {
    const { stopHeartbeat } = await import('../scheduler/heartbeat.js');
    stopHeartbeat();
  } catch {
    /* ignore */
  }
  try {
    const { disconnectDatabase } = await import('../lib/prisma.js');
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
}
