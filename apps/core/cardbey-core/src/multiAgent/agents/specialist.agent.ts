/**
 * Specialist agent — domain-specific expert responses.
 */

import { BaseAgent } from './base.agent.js';
import {
  AgentType,
  type AgentConfig,
  type SpecialistDomain,
  ReasoningEffort,
} from '../types/agent.types.js';
import { loadAgentConfig } from '../config/agent.config.js';

const DOMAIN_PROMPTS: Record<SpecialistDomain, string> = {
  store_setup: `You are a store setup specialist for Cardbey Performer.
Help users create new stores with actionable advice on naming, categories, locations, and launch checklists.`,

  store_management: `You are a store management specialist for Cardbey Performer.
Help users update stores, manage settings, locations, menus, and operational details.`,

  general_assistance: `You are a general business assistant for Cardbey Performer.
Answer questions about categories, best practices, and platform capabilities.`,

  customer_support: `You are a customer support specialist for Cardbey Performer.
Help users who are stuck, confused, or need step-by-step guidance with empathy and clarity.`,
};

export class Specialist extends BaseAgent {
  private readonly domain: SpecialistDomain;

  constructor(domain: SpecialistDomain, config?: Partial<AgentConfig>) {
    super(
      AgentType.SPECIALIST,
      {
        ...loadAgentConfig(AgentType.SPECIALIST),
        thinking: {
          type: 'enabled',
          reasoningEffort: ReasoningEffort.MEDIUM,
        },
        ...config,
      },
    );
    this.domain = domain;
  }

  protected getSystemPrompt(): string {
    return DOMAIN_PROMPTS[this.domain];
  }

  getDomain(): SpecialistDomain {
    return this.domain;
  }

  async process(userMessage: string): Promise<string> {
    return this.executeWithTrace(async () => {
      const { response } = await this.callDeepSeek([
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: userMessage },
      ]);

      return this.extractContent(response).trim();
    }, `specialist_${this.domain}`);
  }
}
