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

  it('classifies create-store typo "create as tore"', () => {
    const intent = classifyIntent({ message: 'create as tore' });
    expect(intent.type).toBe('create_store');
    expect(intent.shouldExecute).toBe(true);
  });

  it('classifies "how can I create a store?" as create_store not capabilities', () => {
    const intent = classifyIntent({ message: 'how can I create a store?' });
    expect(intent.type).toBe('create_store');
  });

  it('classifies looser phrasing make me a store', () => {
    const intent = classifyIntent({ message: 'make me a store' });
    expect(intent.type).toBe('create_store');
  });

  it('classifies create campaign intent', () => {
    const intent = classifyIntent({ message: 'Create a campaign' });
    expect(intent.type).toBe('create_campaign');
    expect(intent.requiresBusiness).toBe(true);
  });

  it('classifies literal create_campaign tool key', () => {
    const intent = classifyIntent({ message: 'create_campaign' });
    expect(intent.type).toBe('create_campaign');
    expect(intent.requiresBusiness).toBe(true);
    expect(intent.shouldExecute).toBe(true);
  });

  it('classifies marketing campaign phrasing', () => {
    const intent = classifyIntent({ message: 'Launch a marketing campaign' });
    expect(intent.type).toBe('create_campaign');
    expect(intent.requiresBusiness).toBe(true);
  });

  it('classifies create loyalty program intent', () => {
    const intent = classifyIntent({ message: 'create a loyalty program from this card' });
    expect(intent.type).toBe('setup_loyalty');
    expect(intent.requiresBusiness).toBe(true);
    expect(intent.shouldExecute).toBe(true);
  });

  it('classifies literal setup_loyalty_program tool key', () => {
    const intent = classifyIntent({ message: 'setup_loyalty_program' });
    expect(intent.type).toBe('setup_loyalty');
    expect(intent.requiresBusiness).toBe(true);
  });

  it('honors explicit manual action key', () => {
    const intent = classifyIntent({ message: 'go', action: 'create_campaign' });
    expect(intent.type).toBe('create_campaign');
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

  it('classifies headline change as content_edit (not question chat fallback)', () => {
    const intent = classifyIntent({
      message: "change headline 'AWE FINANCIAL' to 'AWE FINANCE'",
    });
    expect(intent.type).toBe('content_edit');
    expect(intent.requiresBusiness).toBe(true);
    expect(intent.shouldExecute).toBe(true);
  });

  it('classifies fix-the-headline phrasing as content_edit', () => {
    const intent = classifyIntent({ message: 'fix the headline to MIMI WEB' });
    expect(intent.type).toBe('content_edit');
  });

  it('does not treat hero image swaps as content_edit', () => {
    const intent = classifyIntent({ message: 'change the hero image on my store' });
    expect(intent.type).not.toBe('content_edit');
  });

  it('treats (Image attached) as upload clarify — never generic How can I help', () => {
    const intent = classifyIntent({ message: '(Image attached)' });
    expect(intent.type).toBe('clarify');
    expect(String(intent.response ?? '')).toMatch(/upload/i);
    expect(String(intent.response ?? '')).not.toMatch(/^How can I help you today\?$/i);
  });
});
