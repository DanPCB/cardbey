/**
 * DeepSeek Adapter - Local inference for hybrid reasoning
 * Uses vLLM OpenAI-compatible API
 */

// import { UnifiedMemoryBundle } from '../memory/memoryTypes.js';

const DEEPSEEK_ENDPOINT = process.env.DEEPSEEK_ENDPOINT || 'http://localhost:8000/v1';
const CONFIDENCE_THRESHOLD = {
  DEEPSEEK_ONLY: 0.85,
  ENSEMBLE: 0.65,
  CLOUD_FALLBACK: 0.50
};

export class DeepSeekAdapter {
  constructor() {
    this.endpoint = DEEPSEEK_ENDPOINT;
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V2-Lite-Chat';
    this.timeout = parseInt(process.env.DEEPSEEK_TIMEOUT || '5000');
  }

  /**
   * Generate reasoning and plan using DeepSeek
   */
  async reason(context, memoryBundle) {
    const startTime = Date.now();
    const prompt = this.buildPrompt(context, memoryBundle);
    
    try {
      const response = await this.callDeepSeek(prompt);
      const parsed = this.parseResponse(response);
      const confidence = this.calculateConfidence(response, parsed);
      
      return {
        ok: true,
        source: 'deepseek',
        confidence,
        reasoning: parsed.reasoning,
        plan: parsed.plan,
        latency: Date.now() - startTime,
        tokens: response.usage?.total_tokens || 0,
        cost: this.calculateCost(response.usage?.total_tokens || 0)
      };
    } catch (error) {
      console.error('[DeepSeek] Inference failed:', error);
      return {
        ok: false,
        source: 'deepseek',
        error: error.message,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Build prompt with teacher traces and context
   */
  buildPrompt(context, memoryBundle) {
    const traces = this.getRelevantTeacherTraces(context, memoryBundle);
    
    return {
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        ...traces.map(trace => ({
          role: 'assistant',
          content: trace.reasoning
        })),
        {
          role: 'user',
          content: this.getUserPrompt(context, memoryBundle)
        }
      ],
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 0.95
    };
  }

  /**
   * Get relevant teacher traces from vector DB
   */
  async getRelevantTeacherTraces(context, memoryBundle) {
    // Query vector database (Suitcase) for similar past successful executions
    const queryEmbedding = await this.embedQuery(context);
    
    const traces = await prisma.teacherTrace.findMany({
      where: {
        category: context.intent.category,
        successRate: { gt: 0.7 }
      },
      orderBy: {
        embedding: { vectorDistance: queryEmbedding }
      },
      take: 3
    });
    
    return traces;
  }

  /**
   * Calculate confidence based on logits and self-consistency
   */
  async calculateConfidence(response, parsed) {
  // This is now async - must be awaited
  const samples = await Promise.all([
    this.callDeepSeek(this.buildPrompt(context, memoryBundle), { temperature: 0.3 }),
    this.callDeepSeek(this.buildPrompt(context, memoryBundle), { temperature: 0.5 }),
    this.callDeepSeek(this.buildPrompt(context, memoryBundle), { temperature: 0.7 })
  ]);
    
    // Check if all samples agree on the primary action
    const actions = samples.map(s => this.extractPrimaryAction(s));
    const uniqueActions = new Set(actions);
    
    // Higher confidence = more agreement
    const agreement = 1 - ((uniqueActions.size - 1) / samples.length);
    
    // Combine with logit confidence if available
    const logitConfidence = response.choices[0]?.logprobs?.confidence || 0.5;
    
    return (agreement * 0.6) + (logitConfidence * 0.4);
  }

  async callDeepSeek(prompt, overrides = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          ...prompt,
          ...overrides
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  calculateCost(tokens) {
    // DeepSeek cost: ~$0.14 per 1M tokens
    return (tokens / 1_000_000) * 0.14;
  }

  getSystemPrompt() {
    return `You are Cardbey's AI reasoning engine, an expert in commerce operations.

Your role is to analyze business context and generate actionable plans.

Guidelines:
1. Always consider the store's historical performance
2. Prioritize actions with highest expected ROI
3. Be specific: provide concrete steps, not general advice
4. Include confidence levels for each recommendation
5. Flag any assumptions or missing information

Output format (JSON):
{
  "reasoning": "Step-by-step analysis",
  "plan": {
    "primaryAction": "action_id",
    "steps": [
      { "action": "action_id", "params": {}, "priority": 1 }
    ],
    "expectedOutcome": "description",
    "confidence": 0.85
  },
  "alternatives": [...],
  "assumptions": [...]
}`;
  }

  getUserPrompt(context, memoryBundle) {
    return `
Business Context:
- Intent: ${context.intent.type}
- Store Type: ${memoryBundle.business?.type || 'Unknown'}
- Store Health: ${memoryBundle.state?.awareness?.healthScore || 'N/A'}/100

Recent Performance:
${this.formatRecentActions(memoryBundle.business?.recentActions)}

Active Signals:
${memoryBundle.session?.learnedSignals?.join('\n') || 'None detected'}

Suitcase Items:
${memoryBundle.suitcase?.slice(0, 3).map(i => `- ${i.title}: ${i.summary}`).join('\n') || 'None'}

Goal: ${context.intent.description}

Generate a detailed plan with reasoning and specific actions.
`;
  }

  formatRecentActions(actions) {
    if (!actions?.length) return 'No recent actions';
    return actions.slice(-5).map(a => 
      `- ${a.actionType}: ${a.status} (${new Date(a.timestamp).toLocaleDateString()})`
    ).join('\n');
  }

  extractPrimaryAction(response) {
    try {
      const content = response.choices[0]?.message?.content;
      const parsed = JSON.parse(content);
      return parsed.plan?.primaryAction || parsed.plan?.steps?.[0]?.action;
    } catch {
      return null;
    }
  }
}

export default new DeepSeekAdapter();