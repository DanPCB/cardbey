/**
 * Local Adapter - CPU-optimized models via llama.cpp
 */

export class LocalAdapter {
  constructor() {
    this.endpoint = process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:8000';
    this.model = process.env.LOCAL_LLM_MODEL || 'phi-3-mini';
    this.timeout = parseInt(process.env.LOCAL_LLM_TIMEOUT || '10000');
  }

  async reason(context, memoryBundle) {
    const startTime = Date.now();
    const prompt = this.buildPrompt(context, memoryBundle);
    
    try {
      const response = await this.callLocalModel(prompt);
      const parsed = this.parseResponse(response);
      
      return {
        ok: true,
        source: 'local_cpu',
        confidence: parsed.confidence || 0.75,
        reasoning: parsed.reasoning,
        plan: parsed.plan,
        latency: Date.now() - startTime,
        cost: 0,  // Free!
        model: this.model
      };
    } catch (error) {
      console.error('[LocalAdapter] Inference failed:', error);
      return { ok: false, source: 'local_cpu', error: error.message };
    }
  }

  async callLocalModel(prompt) {
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });
    
    return response.json();
  }

  // ... rest similar to deepseekAdapter
}

export default new LocalAdapter();