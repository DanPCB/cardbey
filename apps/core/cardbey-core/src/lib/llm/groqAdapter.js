// src/lib/llm/groqAdapter.js
export class GroqAdapter {
  async reason(context, memoryBundle) {
    const start = Date.now();
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured. Get it from https://console.groq.com');
    }
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { 
            role: 'system', 
            content: 'You are Cardbey\'s AI reasoning engine. Analyze the business context and return a JSON plan.' 
          },
          { 
            role: 'user', 
            content: context?.intent?.prompt && typeof context.intent.prompt === 'string'
              ? context.intent.prompt
              : JSON.stringify({ 
              intent: context.intent, 
              storeType: memoryBundle?.business?.type,
              signals: memoryBundle?.session?.learnedSignals
            }) 
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    return {
      ok: true,
      source: 'groq',
      confidence: 0.85,
      reasoning: content,
      plan: this.extractPlan(content),
      latency: Date.now() - start,
      cost: 0,  // Free tier
      tokens: data.usage?.total_tokens || 0
    };
  }
  
  extractPlan(content) {
    try {
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON, return as reasoning
    }
    return { primaryAction: 'analyze', steps: [], reasoning: content };
  }
}

export default new GroqAdapter();