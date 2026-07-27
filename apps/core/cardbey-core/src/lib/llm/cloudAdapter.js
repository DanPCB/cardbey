/**
 * Cloud Adapter - OpenAI/Anthropic fallback for complex reasoning
 */

const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1';
const ANTHROPIC_ENDPOINT = process.env.ANTHROPIC_ENDPOINT || 'https://api.anthropic.com/v1';

export class CloudAdapter {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'openai'; // openai, anthropic
    this.timeout = parseInt(process.env.CLOUD_LLM_TIMEOUT || '30000'); // 30 seconds
  }

  async reason(context, memoryBundle) {
    const startTime = Date.now();
    
    try {
      let response;
      if (this.provider === 'openai') {
        response = await this.callOpenAI(context, memoryBundle);
      } else {
        response = await this.callAnthropic(context, memoryBundle);
      }
      
      const parsed = this.parseResponse(response);
      
      return {
        ok: true,
        source: 'cloud',
        confidence: 0.95,
        reasoning: parsed.reasoning,
        plan: parsed.plan,
        latency: Date.now() - startTime,
        tokens: response.usage?.total_tokens || 0,
        cost: this.calculateCost(response.usage?.total_tokens || 0)
      };
    } catch (error) {
      console.error('[CloudAdapter] Inference failed:', error);
      return {
        ok: false,
        source: 'cloud',
        error: error.message,
        latency: Date.now() - startTime
      };
    }
  }

  async callOpenAI(context, memoryBundle) {
    const prompt = this.buildPrompt(context, memoryBundle);
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(`${OPENAI_ENDPOINT}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: this.getSystemPrompt() },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2048
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async callAnthropic(context, memoryBundle) {
    const prompt = this.buildPrompt(context, memoryBundle);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(`${ANTHROPIC_ENDPOINT}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
          system: this.getSystemPrompt(),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
          temperature: 0.7
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  buildPrompt(context, memoryBundle) {
    return `
Business Context:
- Intent: ${context.intent?.type || context.type || 'unknown'}
- Store Type: ${memoryBundle?.business?.type || 'Unknown'}

Goal: ${context.intent?.description || context.description || 'Analyze store performance'}

Generate a detailed plan with reasoning and specific actions.
`;
  }

  getSystemPrompt() {
    return `You are Cardbey's AI reasoning engine. Analyze the business context and generate an actionable plan.`;
  }

  parseResponse(response) {
    let content;
    if (response.choices) {
      // OpenAI format
      content = response.choices[0]?.message?.content;
    } else if (response.content) {
      // Anthropic format
      content = response.content[0]?.text;
    } else {
      content = response;
    }
    
    try {
      return JSON.parse(content);
    } catch {
      // If not JSON, return as reasoning
      return {
        reasoning: content,
        plan: { primaryAction: 'analyze', steps: [] }
      };
    }
  }

  calculateCost(tokens) {
    // GPT-4o-mini: ~$0.15 per 1M tokens
    return (tokens / 1_000_000) * 0.15;
  }
}

export default new CloudAdapter();