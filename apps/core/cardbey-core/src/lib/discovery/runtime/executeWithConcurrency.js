/**
 * Shared Discovery Runtime — concurrency + inter-chunk delay.
 * Pipeline-agnostic: no provider, scrape, or store knowledge.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process items in chunks of `concurrency`, awaiting each chunk with Promise.all,
 * then sleeping `delayMs` between chunks (not after the last chunk).
 *
 * Semantics match the pre-extraction business crawl concurrency loop.
 *
 * @template T
 * @param {T[]} items
 * @param {{ concurrency: number, delayMs: number }} options
 * @param {(item: T) => Promise<void>} worker
 */
export async function executeWithConcurrency(items, options, worker) {
  const list = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(options?.concurrency) || 1);
  const delayMs = Math.max(0, Number(options?.delayMs) || 0);
  const chunkSize = concurrency;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    await Promise.all(chunk.map((item) => worker(item)));
    if (delayMs > 0 && i + chunkSize < list.length) {
      await sleep(delayMs);
    }
  }
}
