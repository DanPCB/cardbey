# Orchestrator v0.1 - Scaffolding

## Overview

Complete folder structure and TypeScript scaffolding for the AI orchestration system. All files are placeholders with empty implementations that run without errors.

## Folder Structure

```
src/orchestrator/
├── types.ts                          # Core TypeScript interfaces
├── context/
│   ├── visionContextParser.ts        # Parse image/vision context
│   ├── textContextParser.ts          # Parse text context
│   ├── metadataEnricher.ts          # Enrich context metadata
│   └── sceneClassifier.ts           # Classify scene/context type
├── intent/
│   ├── businessIntentDetector.ts     # Detect business intents
│   └── workflowIntentClassifier.ts  # Classify workflow intents
├── planning/
│   ├── planBuilder.ts                # Build execution plans
│   ├── planOptimizer.ts              # Optimize plans
│   └── planValidator.ts              # Validate plans
├── skills/
│   ├── skillRegistry.ts              # Skill registry (IMPLEMENTED)
│   ├── skillSelector.ts              # Select skills for intents
│   └── skillComposer.ts              # Compose skills into steps
├── agents/
│   ├── agentRouter.ts                # Route to AI agents
│   └── agentProtocols.ts             # Agent communication protocols
├── execution/
│   ├── workflowRunner.ts             # Execute plans
│   ├── stateStore.ts                 # Execution state management
│   ├── errorHandler.ts               # Error handling
│   └── retryPolicy.ts                # Retry logic
├── memory/
│   ├── sceneMemory.ts                # Scene/context memory
│   ├── storeProfileMemory.ts         # Store profile memory
│   ├── userSessionMemory.ts          # User session memory
│   └── patternLibrary.ts             # Execution pattern library
└── api/
    ├── orchestratorController.ts      # HTTP controller (IMPLEMENTED)
    └── orchestratorRoutes.ts          # Express routes (IMPLEMENTED)
```

## Core Types

All types are defined in `types.ts`:

- **OrchestratorContext** - Rich context for decision-making
- **OrchestratorIntent** - Detected user intent
- **PlanStep** - Single step in execution plan
- **OrchestratorPlan** - Complete execution plan
- **SkillDefinition** - Executable skill definition
- **AgentRequest/AgentResponse** - Agent communication types
- **RetryPolicy** - Retry configuration
- **OrchestratorRunRequest/Response** - API request/response types

## Implemented Features

### Skill Registry (`skills/skillRegistry.ts`)

In-memory skill registry with:
- `addSkill(skill)` - Add skill to registry
- `getSkillById(skillId)` - Get skill by ID
- `findSkillsByTag(tag)` - Find skills by tag
- `listSkills()` - List all skills
- `removeSkill(skillId)` - Remove skill
- `clearSkills()` - Clear all skills

### API Endpoint (`api/orchestratorController.ts`)

**POST /api/orchestrator/run**

Request:
```json
{
  "imageUrl": "https://...",
  "text": "Create a flyer",
  "storeId": "store-123",
  "userId": "user-456",
  "entryPoint": "design_flyer"
}
```

Response:
```json
{
  "ok": true,
  "message": "Orchestrator v0.1 stub running"
}
```

## Usage

### Register a Skill

```typescript
import { addSkill } from './orchestrator/skills/skillRegistry.js';
import { SkillDefinition } from './orchestrator/types.js';

const skill: SkillDefinition = {
  id: 'create-flyer',
  name: 'Create Flyer',
  description: 'Creates a promotional flyer',
  version: '1.0.0',
  tags: ['design', 'flyer', 'marketing']
};

addSkill(skill);
```

### Call Orchestrator API

```bash
curl -X POST http://localhost:3001/api/orchestrator/run \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "store-123",
    "userId": "user-456",
    "text": "Create a flyer for my cafe"
  }'
```

## Next Steps

1. **Implement Context Parsers** - Add vision and text parsing logic
2. **Implement Intent Detection** - Add business and workflow intent detection
3. **Implement Plan Building** - Convert intents to execution plans
4. **Implement Skill Execution** - Add actual skill handlers
5. **Implement Agent Integration** - Connect to AI agents (OpenAI, Anthropic, etc.)
6. **Add Database Persistence** - Replace in-memory stores with database

## Notes

- All functions are empty placeholders
- All in-memory stores use Map/Array (replace with database in production)
- TypeScript interfaces are complete and type-safe
- No business logic implemented yet
- System runs without errors (all functions return safe defaults)


