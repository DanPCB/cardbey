/**
 * Bulkhead Pattern — resource isolation for execution (P6).
 */

export class Bulkhead {
  constructor() {
    /** @type {Map<string, object>} */
    this.executors = new Map();
    this.defaults = {
      maxConcurrent: 10,
      maxQueueSize: 20,
      timeoutMs: 30_000,
    };
  }

  /**
   * @param {{ name: string; maxConcurrent?: number; maxQueueSize?: number; timeoutMs?: number }} config
   */
  configure(config) {
    const { name, maxConcurrent = 10, maxQueueSize = 20, timeoutMs = 30_000 } = config;
    const existing = this.executors.get(name);
    this.executors.set(name, {
      name,
      maxConcurrent,
      maxQueueSize,
      timeoutMs,
      active: existing?.active ?? 0,
      queue: existing?.queue ?? [],
      peakActive: existing?.peakActive ?? 0,
      totalExecutions: existing?.totalExecutions ?? 0,
      lastExecutionAt: existing?.lastExecutionAt ?? null,
    });
    console.log(`[Bulkhead] Configured executor: ${name}`);
  }

  /**
   * @template T
   * @param {string} name
   * @param {() => Promise<T>|T} fn
   * @returns {Promise<T>}
   */
  async execute(name, fn) {
    const executor = this.getOrCreateExecutor(name);

    if (executor.queue.length >= executor.maxQueueSize) {
      throw new Error(`Bulkhead ${name} queue full`);
    }

    return new Promise((resolve, reject) => {
      executor.queue.push({ fn, resolve, reject });
      this.processQueue(name);
    });
  }

  getOrCreateExecutor(name) {
    let executor = this.executors.get(name);
    if (!executor) {
      executor = {
        name,
        maxConcurrent: this.defaults.maxConcurrent,
        maxQueueSize: this.defaults.maxQueueSize,
        timeoutMs: this.defaults.timeoutMs,
        active: 0,
        queue: [],
        peakActive: 0,
        totalExecutions: 0,
        lastExecutionAt: null,
      };
      this.executors.set(name, executor);
    }
    return executor;
  }

  processQueue(name) {
    const executor = this.executors.get(name);
    if (!executor) return;
    if (executor.active >= executor.maxConcurrent) return;
    if (executor.queue.length === 0) return;

    executor.active++;
    executor.peakActive = Math.max(executor.peakActive, executor.active);
    const task = executor.queue.shift();
    let settled = false;

    const settle = (kind, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (kind === 'resolve') task.resolve(value);
      else task.reject(value);
      this.cleanup(name);
    };

    const timeoutId = setTimeout(() => {
      settle('reject', new Error(`Bulkhead ${name} timeout (${executor.timeoutMs}ms)`));
    }, executor.timeoutMs);

    Promise.resolve()
      .then(() => task.fn())
      .then((result) => {
        settle('resolve', result);
      })
      .catch((error) => {
        settle('reject', error);
      });
  }

  cleanup(name) {
    const executor = this.executors.get(name);
    if (!executor) return;
    executor.active = Math.max(0, executor.active - 1);
    executor.totalExecutions += 1;
    executor.lastExecutionAt = Date.now();
    this.processQueue(name);
  }

  resolveUtilization(executor) {
    const peakDecayMs = 300_000;
    if (
      executor.lastExecutionAt &&
      Date.now() - executor.lastExecutionAt > peakDecayMs &&
      executor.active === 0
    ) {
      executor.peakActive = 0;
    }

    const instant =
      executor.maxConcurrent > 0 ? executor.active / executor.maxConcurrent : 0;
    const peak =
      executor.maxConcurrent > 0 ? executor.peakActive / executor.maxConcurrent : 0;
    const recent =
      executor.totalExecutions > 0 && executor.lastExecutionAt
        ? Math.min(1, executor.totalExecutions / Math.max(executor.maxConcurrent * 5, 1))
        : 0;

    return Math.min(1, Math.max(instant, peak, recent * 0.25));
  }

  getStatus(name) {
    const executor = this.executors.get(name);
    if (!executor) return null;
    return {
      name: executor.name,
      active: executor.active,
      queueSize: executor.queue.length,
      maxConcurrent: executor.maxConcurrent,
      maxQueueSize: executor.maxQueueSize,
      peakActive: executor.peakActive,
      totalExecutions: executor.totalExecutions,
      lastExecutionAt: executor.lastExecutionAt,
      utilization: this.resolveUtilization(executor),
    };
  }

  getAllStatuses() {
    const statuses = {};
    for (const name of this.executors.keys()) {
      statuses[name] = this.getStatus(name);
    }
    return statuses;
  }

  resetForTests() {
    this.executors.clear();
  }
}

const bulkhead = new Bulkhead();
export default bulkhead;
