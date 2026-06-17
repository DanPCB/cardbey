import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBus } from '../messageBus.js';

describe('MessageBus', () => {
  /** @type {MessageBus} */
  let bus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  it('publishes and stores message history', () => {
    const msg = bus.publish('analytics_agent', {
      type: 'execution_started',
      from: 'orchestrator',
    });

    expect(msg.id).toBeTruthy();
    expect(msg.target).toBe('analytics_agent');
    expect(msg.type).toBe('execution_started');

    const history = bus.getHistory('analytics_agent');
    expect(history).toHaveLength(1);
  });

  it('subscribes to agent messages', async () => {
    const received = [];

    bus.subscribe('creative_agent', (message) => {
      received.push(message);
    });

    bus.publish('creative_agent', { type: 'handoff', from: 'analytics_agent' });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('handoff');
  });

  it('emits topic events', async () => {
    const topicMessages = [];

    bus.on('topic:agent_handoff', (message) => {
      topicMessages.push(message);
    });

    bus.publish('optimizer_agent', {
      type: 'handoff',
      topic: 'agent_handoff',
      from: 'analytics_agent',
    });

    expect(topicMessages).toHaveLength(1);
  });
});
