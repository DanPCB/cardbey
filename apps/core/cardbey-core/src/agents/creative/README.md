# Creative Agent (Imaginarium v1)

## Overview

The Creative Agent generates proactive, contextual creative ideas based on orchestrator context and plans. This module is currently scaffolded with stub implementations.

## Structure

```
src/agents/creative/
├── types.ts              # Core TypeScript interfaces
├── creativeAgent.ts      # Creative Agent implementation (stub)
├── index.ts              # Central exports
└── README.md             # This file
```

## Types

### CreativeContext

Context for generating creative proposals:
- `storeId` - Store/Business ID (required)
- `userId` - User ID (optional)
- `businessType` - Business category (optional)
- `country` - Location (optional)
- `sceneType` - Scene classification (required)
- `extractedData` - OCR results, detected objects, etc.
- `currentIntent` - Current user intent
- `currentPlanSummary` - Summary of orchestrator plan

### CreativeProposal

A creative idea/proposal:
- `id` - Unique proposal ID
- `title` - Proposal title
- `description` - Proposal description
- `category` - Proposal category (loyalty, campaign, branding, etc.)
- `estimatedImpact` - Impact level (low/medium/high)
- `complexity` - Implementation complexity (simple/moderate/advanced)
- `requiredSkills` - Skill tags needed
- `followUpPlanSummary` - What happens if accepted

### CreativeResponse

Response containing array of proposals.

## Usage

### Basic Usage

```typescript
import { createCreativeAgent, CreativeContext } from './agents/creative/index.js';

const agent = createCreativeAgent();

const context: CreativeContext = {
  storeId: 'store-123',
  sceneType: 'loyalty_card',
  extractedData: {},
  currentIntent: 'create_loyalty_program'
};

const response = await agent.generateProposals(context);
console.log(response.proposals); // Array of CreativeProposal
```

### Scene Types

The agent returns different proposals based on `sceneType`:

- **loyalty_card** - Loyalty program ideas
- **menu_photo** - Menu and combo ideas
- **shopfront** - Digital signage and AR ideas
- **campaign_setup** - Campaign and marketing ideas
- **generic** - General branding and operational ideas

## Integration Points

### Orchestrator Integration

The Creative Agent is designed to be called from the Orchestrator:

1. **Plan Builder** (`src/orchestrator/planning/planBuilder.ts`)
   - Placeholder hook: `summarizePlanForCreative()`
   - TODO: Wire Creative Agent call after plan building

2. **Agent Protocols** (`src/orchestrator/agents/agentProtocols.ts`)
   - Type aliases: `CreativeAgentInput`, `CreativeAgentOutput`
   - Ready for protocol-based integration

## Current Implementation

### Stub Behavior

The `DefaultCreativeAgent` currently:
- Returns hard-coded proposals based on `sceneType`
- Does NOT call any real LLM models
- Provides 2-3 differentiated proposals per scene type
- All proposals include complete metadata (impact, complexity, skills, etc.)

### Example Proposals

**Loyalty Card Scene:**
- Mystery 10th Coffee Day
- VIP Tier After 30 Visits
- Birthday Bonus Program

**Shopfront Scene:**
- Digital Signage Display
- AR Menu Experience
- Smart Window Display

**Menu Photo Scene:**
- Combo Meal Promotion
- Daily Special Highlight
- Seasonal Menu Refresh

## TODO

- [ ] Replace stub with real LLM-based creative generation
- [ ] Integrate with Orchestrator plan building flow
- [ ] Add proposal ranking/scoring logic
- [ ] Implement proposal persistence
- [ ] Add proposal acceptance tracking
- [ ] Create proposal-to-plan conversion logic

## Notes

- All functions are safe stubs that return valid data
- No external dependencies added
- TypeScript types are complete and type-safe
- Ready for real implementation without breaking changes


