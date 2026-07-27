/**
 * Message Bus — agent-to-agent communication.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export class MessageBus extends EventEmitter {
  constructor() {
    super();
    /** @type {object[]} */
    this.messageHistory = [];
    /** @type {Map<string, Function[]>} */
    this.subscribers = new Map();
    this.maxHistory = 1000;
  }

  /**
   * @param {string} target
   * @param {object} message
   */
  publish(target, message) {
    const msg = {
      id: randomUUID(),
      target: String(target),
      ...(message && typeof message === 'object' ? message : {}),
      timestamp: new Date().toISOString(),
    };

    this.messageHistory.push(msg);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    this.emit('message', msg);
    this.emit(`target:${target}`, msg);

    if (msg.topic) {
      this.emit(`topic:${String(msg.topic)}`, msg);
    }

    console.log(`[MessageBus] Published to ${target}: ${msg.type || 'message'}`);
    return msg;
  }

  /**
   * @param {string} agentId
   * @param {Function} callback
   */
  subscribe(agentId, callback) {
    const id = String(agentId);
    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, []);
    }
    this.subscribers.get(id).push(callback);
    this.on(`target:${id}`, callback);

    return () => this.unsubscribe(id, callback);
  }

  /**
   * @param {string} agentId
   * @param {Function} callback
   */
  unsubscribe(agentId, callback) {
    const id = String(agentId);
    const callbacks = this.subscribers.get(id) ?? [];
    this.subscribers.set(
      id,
      callbacks.filter((cb) => cb !== callback),
    );
    this.off(`target:${id}`, callback);
  }

  /**
   * @param {string} agentId
   * @param {number} [limit]
   */
  getHistory(agentId, limit = 50) {
    const id = String(agentId);
    return this.messageHistory
      .filter((msg) => msg.target === id || msg.from === id)
      .slice(-limit);
  }

  clearHistory() {
    this.messageHistory = [];
  }

  resetForTests() {
    this.clearHistory();
    this.subscribers.clear();
    this.removeAllListeners();
  }
}

const messageBus = new MessageBus();
export default messageBus;
