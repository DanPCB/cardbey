/**
 * Template AI Proposal Service
 * Generates AI-powered template proposals from user queries
 */

import { openaiTextEngine } from '../ai/engines/openaiTextEngine.js';
import type { TemplateSlot, TemplateAIContext } from '@cardbey/template-engine';

export interface AITemplateProposal {
  id: string; // Ephemeral ID (generated client-side or server-side)
  name: string;
  description: string;
  suggestedKind: 'GRAPHIC' | 'VIDEO' | 'REPORT' | 'PROCESS';
  suggestedChannel?: string;
  suggestedOrientation?: 'vertical' | 'horizontal' | 'square' | 'any';
  tags?: string[];
  fields: {
    slots: TemplateSlot[];
  };
  aiContext: TemplateAIContext;
}

export interface GenerateProposalsParams {
  query: string;
  tenantId?: string | null;
  storeId?: string | null;
  channel?: string | null;
  role?: string | null;
  primaryIntent?: string | null;
  orientation?: string | null;
  businessContext?: {
    business: {
      name: string;
      description?: string | null;
      logoUrl?: string | null;
    } | null;
  };
}

/**
 * Generate AI template proposals from a user query
 * Returns 1-3 proposals with fields and aiContext, but does NOT create DB entries
 */
export async function generateTemplateProposalsFromQuery(
  params: GenerateProposalsParams
): Promise<AITemplateProposal[]> {
  const { query, channel, role, primaryIntent, orientation, businessContext } = params;

  try {
    // Build system prompt
    const systemPrompt = `You are a professional template designer for a business marketing platform.
Generate creative template proposals based on user queries. Each proposal should include:
- A clear name and description
- Suggested template kind (GRAPHIC, VIDEO, REPORT, or PROCESS)
- Suggested channel (cnet_screen, storefront, social, web, etc.)
- Suggested orientation (vertical, horizontal, square, or any)
- Relevant tags
- Template slots (fields) that would be useful for this template
- AI context (tone, audience, language, styleHints)

Return JSON array with 1-3 proposals. Each proposal must have:
- name: string
- description: string
- suggestedKind: "GRAPHIC" | "VIDEO" | "REPORT" | "PROCESS"
- suggestedChannel: string (optional)
- suggestedOrientation: "vertical" | "horizontal" | "square" | "any" (optional)
- tags: string[]
- fields: { slots: TemplateSlot[] }
- aiContext: { tone, audience, language, styleHints }

TemplateSlot structure:
{
  "id": "slot_id",
  "label": "Human-readable label",
  "type": "text" | "richtext" | "image" | "video" | "color" | "date" | "number",
  "required": boolean (optional),
  "defaultValue": any (optional),
  "sourceKey": "business.name" (optional, for auto-fill),
  "description": string (optional)
}`;

    // Build user prompt
    const businessName = businessContext?.business?.name || 'the business';
    const businessDesc = businessContext?.business?.description || '';
    const businessInfo = businessDesc 
      ? `${businessName} (${businessDesc})`
      : businessName;

    const contextInfo = [
      query && `User query: "${query}"`,
      channel && `Target channel: ${channel}`,
      role && `Role: ${role}`,
      primaryIntent && `Primary intent: ${primaryIntent}`,
      orientation && `Orientation: ${orientation}`,
      businessContext?.business && `Business: ${businessInfo}`,
    ].filter(Boolean).join('\n');

    const userPrompt = `Generate 1-3 template proposals based on:
${contextInfo}

Requirements:
- Proposals should be practical and ready to use
- Include 3-6 template slots per proposal
- Use appropriate slot types (text, richtext, image, color, etc.)
- Set reasonable defaultValues where helpful
- Use sourceKey: "business.name" for business name slots
- AI context should match the template's purpose

Return JSON array only, no explanations.`;

    // Call OpenAI
    const result = await openaiTextEngine.generateText({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    });

    const text = result.text?.trim() || '';
    if (!text) {
      console.warn('[TemplateAIProposal] Empty response from AI');
      return [];
    }

    // Parse JSON response
    let parsed: any;
    try {
      // Clean up markdown code blocks if present
      const cleanedText = text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[TemplateAIProposal] Failed to parse JSON:', parseError);
      console.error('[TemplateAIProposal] Raw response:', text);
      return [];
    }

    // Ensure it's an array
    const proposals = Array.isArray(parsed) ? parsed : (parsed.proposals || parsed.results || [parsed]);

    // Validate and normalize proposals
    const validatedProposals: AITemplateProposal[] = [];
    for (const proposal of proposals.slice(0, 3)) { // Max 3 proposals
      if (!proposal || typeof proposal !== 'object') continue;
      if (!proposal.name || !proposal.description) continue;
      if (!proposal.fields || !Array.isArray(proposal.fields.slots)) continue;

      // Generate ephemeral ID
      const id = `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      validatedProposals.push({
        id,
        name: String(proposal.name),
        description: String(proposal.description),
        suggestedKind: proposal.suggestedKind || 'GRAPHIC',
        suggestedChannel: proposal.suggestedChannel || channel || undefined,
        suggestedOrientation: proposal.suggestedOrientation || orientation || undefined,
        tags: Array.isArray(proposal.tags) ? proposal.tags : [],
        fields: {
          slots: proposal.fields.slots || [],
        },
        aiContext: proposal.aiContext || {
          tone: 'friendly',
          audience: 'general',
          language: 'en',
          styleHints: [],
        },
      });
    }

    console.log(`[TemplateAIProposal] Generated ${validatedProposals.length} proposals for query: "${query}"`);
    return validatedProposals;
  } catch (error) {
    console.error('[TemplateAIProposal] Failed to generate proposals:', error);
    return [];
  }
}

