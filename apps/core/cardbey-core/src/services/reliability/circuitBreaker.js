/**
 * Circuit Breaker — prevents cascading failures on repeated errors (P6).
 */

export class CircuitBreaker {
  constructor() {
    /** @type {Map<string, object>} */
    this.circuits = new Map();
    this.defaults = {
      threshold: 5,
      timeout: 30_000,
      halfOpenTimeout: 10_000,
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
        throw new Error(`Circuit ${name} is open`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess(name);
      return result;
    } catch (error) {
      this.onFailure(name);
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

  resetForTests() {
    this.circuits.clear();
  }
}

const circuitBreaker = new CircuitBreaker();
export default circuitBreaker;
