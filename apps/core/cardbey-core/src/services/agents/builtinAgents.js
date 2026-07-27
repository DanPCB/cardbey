/**
 * Built-in Agents — pre-registered sub-agents mapped to composable skills.
 */

import agentRegistry from './agentRegistry.js';
import agentLifecycle from './agentLifecycle.js';

const BUILTIN_AGENTS = [
  {
    id: 'analytics_agent',
    name: 'Analytics Agent',
    description: 'Analyzes store performance metrics and trends',
    version: '1.0.0',
    capabilities: ['analyze', 'forecast', 'insights'],
    skillId: 'analyze_store',
    config: { timeout: 30_000, retryAttempts: 3 },
  },
  {
    id: 'creative_agent',
    name: 'Creative Agent',
    description: 'Generates content, designs, and creative assets',
    version: '1.0.0',
    capabilities: ['generate', 'design', 'create'],
    skillId: 'generate_content',
    config: { timeout: 60_000, retryAttempts: 2 },
  },
  {
    id: 'optimizer_agent',
    name: 'Optimizer Agent',
    description: 'Optimizes campaigns, pricing, and inventory',
    version: '1.0.0',
    capabilities: ['optimize', 'adjust', 'improve'],
    skillId: 'create_campaign',
    config: { timeout: 45_000, retryAttempts: 3 },
  },
  {
    id: 'concierge_agent',
    name: 'Concierge Agent',
    description: 'Customer support and personalized recommendations',
    version: '1.0.0',
    capabilities: ['support', 'recommend', 'assist'],
    skillId: 'analyze_store_fallback',
    config: { timeout: 20_000, retryAttempts: 2 },
  },
];

for (const agent of BUILTIN_AGENTS) {
  agentRegistry.register(agent);
  agentLifecycle.start(agent.id);
}

console.log('[BuiltinAgents] Registered built-in agents');

export default BUILTIN_AGENTS;
