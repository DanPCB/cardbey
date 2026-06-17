/**
 * Circuit Breaker — prevents cascading failures on repeated errors (P6).
 */

export class CircuitBreaker {
  constructor() {
    /** @type {Map<string, object>} */
    this.circuits = new Map();
    this.defaults = {
      threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 8,
      timeout: 30_000,
      halfOpenTimeout: parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_MS, 10) || 15_000,
    };
  }

  /**
   * @template T
   * @param {string} name
   * @param {() => Promise<T>|T} fn
   * @returns {Promise<T>}
   */
  async execute(name, fn) {
    const circuit = this.getCircuit(name);

    if (circuit.state === 'open') {
      if (Date.now() - circuit.lastFailure > circuit.halfOpenTimeout) {
        circuit.state = 'half-open';
        console.log(`[CircuitBreaker] ${name} half-open — testing`);
      } else {
        const err = new Error(`Circuit ${name} is open`);
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
    }

    try {
      const result = await fn();
      this.onSuccess(name);
      return result;
    } catch (error) {
      if (error?.code !== 'CIRCUIT_OPEN') {
        this.onFailure(name);
      }
      throw error;
    }
  }

  /**
   * @param {string} name
   */
  getCircuit(name) {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, {
        state: 'closed',
        failures: 0,
        lastFailure: null,
        threshold: this.defaults.threshold,
        timeout: this.defaults.timeout,
        halfOpenTimeout: this.defaults.halfOpenTimeout,
      });
    }
    return this.circuits.get(name);
  }

  /**
   * @param {string} name
   */
  onSuccess(name) {
    const circuit = this.circuits.get(name);
    if (!circuit) return;
    circuit.failures = 0;
    circuit.state = 'closed';
  }

  /**
   * @param {string} name
   */
  onFailure(name) {
    const circuit = this.circuits.get(name);
    if (!circuit) return;
    circuit.failures += 1;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= circuit.threshold) {
      circuit.state = 'open';
      console.warn(`[CircuitBreaker] ${name} opened after ${circuit.failures} failures`);
    }
  }

  getStatus(name) {
    const circuit = this.circuits.get(name);
    if (!circuit) return null;
    return {
      name,
      state: circuit.state,
      failures: circuit.failures,
      threshold: circuit.threshold,
      lastFailure: circuit.lastFailure,
    };
  }

  getAllStatuses() {
    const statuses = {};
    for (const name of this.circuits.keys()) {
      statuses[name] = this.getStatus(name);
    }
    return statuses;
  }

  /**
   * @param {string} [name]
   */
  reset(name) {
    if (name) {
      this.circuits.delete(name);
      return;
    }
    this.circuits.clear();
  }

  resetForTests() {
    this.circuits.clear();
  }
}

const circuitBreaker = new CircuitBreaker();
export default circuitBreaker;
