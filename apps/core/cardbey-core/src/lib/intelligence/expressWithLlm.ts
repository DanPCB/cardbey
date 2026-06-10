// apps/core/cardbey-core/src/lib/intelligence/expressWithLlm.ts

/**
 * Layer 4 - LLM Expression Server
 * POST /api/intelligence/express
 * Replaces /api/pil/concierge/interpret
 */

import type {
  ExpressionInput,
  ExpressionOutput,
  FallbackExpressionOutput,
  ExpressionErrorResponse,
} from './types';

// Constants per architect decision
const LLM_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2; // 1 initial + 1 retry
const RETRYABLE_STATUS_CODES = [429, 502, 503, 504];
const RATE_LIMIT_PER_SESSION = 6; // per hour (server-side)

// In-memory rate limit store (per audit, will need Redis for multi-instance)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for session/user
 */
function checkRateLimit(key: string): { allowed: boolean; remaining?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + 3600000 });
    return { allowed: true, remaining: RATE_LIMIT_PER_SESSION - 1 };
  }
  
  if (record.count >= RATE_LIMIT_PER_SESSION) {
    return { allowed: false };
  }
  
  record.count++;
  rateLimitStore.set(key, record);
  return { allowed: true, remaining: RATE_LIMIT_PER_SESSION - record.count };
}

/**
 * Cleanup rate limit store periodically (every 5 min)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

/**
 * Forbidden diagnostic terms
 */
const FORBIDDEN_TERMS = [
  'detected', 'signal', 'scoring', 'backend', 
  'PIL', 'pipeline', 'instrumentation', 'rule', 'metric'
];

function buildAllowedKeyFactSet(
  facts: Array<{ label?: string; value?: string | number }>,
): Set<string> {
  const allowed = new Set<string>();
  for (const f of facts) {
    const label = String(f.label ?? '').trim();
    const value = String(f.value ?? '').trim();
    if (label) allowed.add(label);
    if (label && value) {
      allowed.add(`${label}: ${value}`);
      allowed.add(`${label}:${value}`);
    }
  }
  return allowed;
}

function matchesAssessmentFactLoosely(
  keyFact: string,
  facts: Array<{ label?: string }>,
): boolean {
  const lower = String(keyFact).trim().toLowerCase();
  return facts.some((f) => {
    const label = String(f.label ?? '').trim().toLowerCase();
    if (!label) return false;
    return lower === label || lower.startsWith(`${label}:`);
  });
}

/**
 * Validate LLM response against input
 */
function validateResponse(
  response: any,
  input: ExpressionInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!response.title || typeof response.title !== 'string') {
    errors.push('title is required and must be string');
  }
  if (!response.message || typeof response.message !== 'string') {
    errors.push('message is required and must be string');
  }
  if (!response.primarySuggestionId) {
    errors.push('primarySuggestionId is required');
  }
  
  // Check primarySuggestionId exists in input suggestions
  const suggestionIds = new Set(input.suggestions.map(s => s.id));
  if (!suggestionIds.has(response.primarySuggestionId)) {
    errors.push(`primarySuggestionId ${response.primarySuggestionId} not in input suggestions`);
  }
  
  // Check secondarySuggestionIds
  if (response.secondarySuggestionIds) {
    for (const id of response.secondarySuggestionIds) {
      if (!suggestionIds.has(id)) {
        errors.push(`secondarySuggestionId ${id} not in input suggestions`);
      }
    }
  } else {
    response.secondarySuggestionIds = []; // default to empty array
  }
  
  // Check keyFacts reference assessment facts (label or "Label: value" forms)
  if (response.keyFacts) {
    const allowed = buildAllowedKeyFactSet(input.assessment.facts);
    for (const fact of response.keyFacts) {
      const normalized = String(fact ?? '').trim();
      if (!normalized) continue;
      if (!allowed.has(normalized) && !matchesAssessmentFactLoosely(normalized, input.assessment.facts)) {
        errors.push(`keyFact "${fact}" not in assessment facts`);
      }
    }
  }
  
  // Check memoryReference exists in suitcase
  if (response.memoryReference) {
    const suitcaseTitles = new Set(input.context.memory.suitcase.map(s => s.title));
    if (!suitcaseTitles.has(response.memoryReference)) {
      errors.push(`memoryReference "${response.memoryReference}" not in suitcase`);
    }
  }
  
  // Check for forbidden terms
  const responseText = `${response.title} ${response.message}`.toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    if (responseText.includes(term.toLowerCase())) {
      errors.push(`forbidden term "${term}" in response`);
    }
  }
  
  // Check for hallucinated numbers/metrics
  const hasNewMetric = /[0-9]+%|\d+(?:\.\d+)?\s*(?:points|percent|score)/i.test(responseText);
  if (hasNewMetric) {
    errors.push('response contains numbers/metrics not in assessment facts');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Call LLM with timeout and retry
 */
async function callLLMWithRetry(
  systemPrompt: string,
  userPrompt: string,
  attempt: number = 0
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  
  try {
    // Assume OpenAI compatible endpoint
    const response = await fetch(process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const shouldRetry = RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_ATTEMPTS - 1;
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms backoff
        return callLLMWithRetry(systemPrompt, userPrompt, attempt + 1);
      }
      return null;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;
    
    // Parse JSON from response (may be wrapped in markdown)
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```|(\{[\s\S]*\})/);
    const jsonStr = jsonMatch?.[1] || jsonMatch?.[2] || content;
    
    return jsonStr;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn('LLM timeout after', LLM_TIMEOUT_MS, 'ms');
      return null;
    }
    console.error('LLM call failed:', error);
    return null;
  }
}

/**
 * Build system prompt
 */
function buildSystemPrompt(surface: string): string {
  return `You are Cardbey's Contextual AI Concierge. Your job is to help users naturally.

CRITICAL RULES:
- NEVER mention: detected, signal, scoring, backend, rule, instrumentation, pipeline, PIL
- NEVER invent data not in the provided context
- NEVER suggest actions outside the provided suggestions list
- NEVER promise guaranteed results or auto-execution
- Keep messages SHORT (2-3 sentences maximum)
- Keep titles SHORT (5-7 words maximum)
- Use conversational, helpful tone
- For store owners, explain business situation in plain English, not as a report
- You may reference AT MOST ONE memory item from suitcase (by its title)

Output MUST be valid JSON with these fields:
{
  "title": "short title",
  "message": "helpful 2-3 sentence message",
  "primarySuggestionId": "ID from suggestions list",
  "secondarySuggestionIds": ["array", "of", "IDs"],
  "keyFacts": ["optional", "array", "of", "fact", "labels"],
  "memoryReference": "optional single suitcase item title"
}`;
}

/**
 * Build user prompt from input
 */
function buildUserPrompt(input: ExpressionInput): string {
  const sections = [];
  
  sections.push(`Surface: ${input.surface}`);
  sections.push(`Actor: ${input.context.actor.type}`);
  sections.push(`Entity: ${input.context.entity.name || input.context.entity.type}`);
  
  if (input.context.memory.business) {
    sections.push(`Store Health: ${input.assessment.scores.healthScore || 'unknown'}/100`);
    const issues = input.assessment.issues.filter(i => i.severity === 'critical' || i.severity === 'attention');
    if (issues.length) {
      sections.push(`Key Issues: ${issues.map(i => i.title).join(', ')}`);
    }
  }
  
  if (input.context.memory.suitcase.length) {
    sections.push(`Recent Suitcase Items: ${input.context.memory.suitcase.map(s => s.title).join(', ')}`);
  }
  
  sections.push(`\nAvailable Suggestions (by ID):`);
  for (const suggestion of input.suggestions) {
    sections.push(`  - ${suggestion.id}: ${suggestion.label}`);
  }
  
  sections.push(`\nAvailable Facts (by label):`);
  for (const fact of input.assessment.facts) {
    sections.push(`  - ${fact.label}: ${fact.value}`);
  }
  
  sections.push(`\nGenerate a helpful, conversational message for the user.`);
  
  return sections.join('\n');
}

/**
 * Main entry point for LLM expression
 */
export async function expressWithLlm(
  input: ExpressionInput
): Promise<ExpressionOutput | FallbackExpressionOutput | null> {
  // Rate limiting
  const rateLimitKey = input.context.actor.id || input.context.session.sessionId || 'anonymous';
  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    console.warn('Rate limit exceeded for', rateLimitKey);
    return null;
  }
  
  const systemPrompt = buildSystemPrompt(input.surface);
  const userPrompt = buildUserPrompt(input);
  
  const llmResponse = await callLLMWithRetry(systemPrompt, userPrompt);
  
  if (!llmResponse) {
    return null;
  }
  
  try {
    const parsed = JSON.parse(llmResponse);
    const validation = validateResponse(parsed, input);
    
    if (!validation.valid) {
      console.warn('LLM response validation failed:', validation.errors);
      return null;
    }
    
    return {
      title: parsed.title,
      message: parsed.message,
      primarySuggestionId: parsed.primarySuggestionId,
      secondarySuggestionIds: parsed.secondarySuggestionIds || [],
      keyFacts: parsed.keyFacts,
      memoryReference: parsed.memoryReference,
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return null;
  }
}