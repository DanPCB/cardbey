import { describe, expect, it, vi } from 'vitest';
import { executionGateway } from '../executionGateway.js';

describe('executionGateway (pure orchestration layer)', () => {
  it('ask -> returns prompt', async () => {
    const dispatchTool = vi.fn(async () => ({ status: 'ok' }));
    const out = await executionGateway({
      decision: { kind: 'ask', prompt: 'Which store?', options: ['A', 'B'] },
      context: { missionId: 'm1' },
      dispatchTool,
    });
    expect(out).toEqual({ action: 'ask', prompt: 'Which store?', options: ['A', 'B'] });
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('confirm -> returns approval_required', async () => {
    const dispatchTool = vi.fn(async () => ({ status: 'ok' }));
    const out = await executionGateway({
      decision: {
        kind: 'confirm',
        toolName: 'launch_campaign',
        parameters: { storeId: 's1' },
        confirmation: { title: 'Confirm', summary: 'Risky', riskLevel: 'state_change' },
      },
      context: { missionId: 'm1' },
      dispatchTool,
    });
    expect(out).toEqual({
      action: 'approval_required',
      tool: 'launch_campaign',
      parameters: { storeId: 's1' },
      confirmation: { title: 'Confirm', summary: 'Risky', riskLevel: 'state_change' },
    });
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('execute -> calls dispatchTool', async () => {
    const dispatchTool = vi.fn(async (toolName, parameters, context) => ({
      toolName,
      parameters,
      context,
    }));
    const ctx = { missionId: 'm1', storeId: 's1' };
    const out = await executionGateway({
      decision: { kind: 'execute', toolName: 'generate_slideshow', parameters: { storeId: 's1' } },
      context: ctx,
      dispatchTool,
    });
    expect(dispatchTool).toHaveBeenCalledTimes(1);
    expect(dispatchTool).toHaveBeenCalledWith('generate_slideshow', { storeId: 's1' }, ctx);
    expect(out).toEqual({
      toolName: 'generate_slideshow',
      parameters: { storeId: 's1' },
      context: ctx,
    });
  });

  it('unsupported -> returns chat fallback', async () => {
    const dispatchTool = vi.fn(async () => ({ status: 'ok' }));
    const out = await executionGateway({
      decision: { kind: 'unsupported' },
      context: {},
      dispatchTool,
    });
    expect(out).toEqual({
      action: 'chat',
      message: 'I’m not able to perform that action yet.',
    });
    expect(dispatchTool).not.toHaveBeenCalled();
  });
});

