import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent } from '../classifier/IntentClassifier.js';

describe('IntentClassifier', () => {
  it('classifies greeting without business context', () => {
    const intent = classifyIntent({ message: 'Hi' });
    expect(intent.type).toBe('greeting');
    expect(intent.requiresBusiness).toBe(false);
    expect(intent.response).toContain('Hello');
  });

  it('classifies capabilities question', () => {
    const intent = classifyIntent({ message: 'What can you do?' });
    expect(intent.type).toBe('capabilities');
    expect(intent.requiresBusiness).toBe(false);
  });

  it('classifies help request', () => {
    const intent = classifyIntent({ message: 'I need help' });
    expect(intent.type).toBe('help');
    expect(intent.requiresBusiness).toBe(false);
  });

  it('classifies question turn', () => {
    const intent = classifyIntent({ message: 'answer a question.' });
    expect(intent.type).toBe('question');
    expect(intent.requiresBusiness).toBe(false);
  });

  it('classifies create store intent', () => {
    const intent = classifyIntent({ message: 'Create a store' });
    expect(intent.type).toBe('create_store');
    expect(intent.requiresBusiness).toBe(true);
    expect(intent.shouldExecute).toBe(true);
  });

  it('classifies create campaign intent', () => {
    const intent = classifyIntent({ message: 'Create a campaign' });
    expect(intent.type).toBe('create_campaign');
    expect(intent.requiresBusiness).toBe(true);
  });

  it('does not use primaryModeHint to force store on casual chat', () => {
    const intent = classifyIntent({ message: 'Hi', primaryModeHint: 'store_setup' });
    expect(intent.type).toBe('greeting');
    expect(intent.requiresBusiness).toBe(false);
  });

  it('honors explicit store creation form', () => {
    const intent = classifyIntent({
      message: 'submit',
      storeCreateForm: { storeName: 'Melbourne Cafe' },
    });
    expect(intent.type).toBe('create_store');
  });
});
