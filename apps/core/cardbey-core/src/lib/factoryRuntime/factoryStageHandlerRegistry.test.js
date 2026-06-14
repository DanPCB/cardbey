import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerFactoryStageHandler,
  getFactoryStageHandler,
  listFactoryStageHandlers,
  clearFactoryStageHandlersForTests,
} from './factoryStageHandlerRegistry.js';

describe('factoryStageHandlerRegistry', () => {
  beforeEach(() => {
    clearFactoryStageHandlersForTests();
  });

  it('registers and resolves handlers per factory/stage', async () => {
    const handler = async () => ({ ok: true, output: { x: 1 } });
    registerFactoryStageHandler('test_factory', 'stage_a', handler);
    expect(getFactoryStageHandler('test_factory', 'stage_a')).toBe(handler);
    expect(listFactoryStageHandlers('test_factory')).toHaveLength(1);
  });
});
