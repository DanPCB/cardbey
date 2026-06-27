/**
 * Process-level guards — log fatal errors; exit only on heap OOM.
 * Import immediately after env bootstrap in server.js.
 */

function isHeapOom(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  return msg.includes('heap out of memory') || msg.includes('allocation failed');
}

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error?.message ?? error);
  if (error?.stack) console.error(error.stack);
  if (isHeapOom(error)) {
    console.error('[FATAL] Heap OOM — exiting');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  if (isHeapOom(reason)) {
    console.error('[FATAL] Heap OOM (rejection) — exiting');
    process.exit(1);
  }
});
