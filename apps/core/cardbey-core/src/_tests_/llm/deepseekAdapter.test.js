describe('DeepSeek Adapter', () => {
  it('returns reasoning with confidence', async () => {
    const result = await deepseekAdapter.reason(mockContext, mockMemory);
    expect(result.ok).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.source).toBe('deepseek');
  });
  
  it('handles timeout gracefully', async () => {
    jest.useFakeTimers();
    const promise = deepseekAdapter.reason(mockContext, mockMemory);
    jest.advanceTimersByTime(6000);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timeout');
  });
});

describe('Hybrid Router Integration', () => {
  it('routes simple queries to DeepSeek only', async () => {
    const result = await hybridRouter.route(simpleIntent, context, memory);
    expect(result.decision).toBe('deepseek_only');
    expect(result.cost).toBeLessThan(0.001);
  });
  
  it('routes complex queries to ensemble', async () => {
    const result = await hybridRouter.route(complexIntent, context, memory);
    expect(result.decision).toBe('ensemble');
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});