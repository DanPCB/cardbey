# Reporter Agent

## Overview

The Reporter Agent generates human-readable activity reports from event data. It transforms raw activity events into concise, markdown-formatted reports suitable for store owners and operators.

## Structure

```
src/agents/reporter/
├── types.ts              # TypeScript interfaces
├── prompts.ts             # LLM prompts and examples
├── reporterAgent.ts      # Reporter Agent implementation
├── index.ts               # Central exports
└── README.md              # This file
```

## Types

### DailyTenantReporterInput

Input format for generating a daily tenant report:
- `tenantId` - Tenant identifier (required)
- `tenantName` - Human-readable tenant name (required)
- `date` - ISO date string, e.g. "2025-12-05" (required)
- `events` - Array of activity event summaries (required)
- `stats` - Aggregated statistics (required)

### ActivityEventSummary

Represents a single event in the activity summary:
- `time` - Time string, e.g. "09:02"
- `type` - Event type (e.g., "playlist_assigned", "playlist_error", "feedback_negative", "device_status_change")
- `details` - Human-readable event description

### ActivityStats

Aggregated statistics for a reporting period:
- `playlistAssignments` - Number of playlist assignments
- `deviceErrors` - Number of device errors
- `feedbackNegative` - Number of negative feedback items
- `devicesOffline` - Number of devices that went offline
- Additional custom stats can be added

### ReporterResponse

Response from the Reporter Agent:
- `contentMd` - Generated markdown report content
- `title` - Report title (extracted from markdown)
- `scope` - Report scope/category (e.g., "tenant_activity")
- `tags` - Optional comma-separated tags for filtering

## Usage

### Basic Usage

```typescript
import { getReporterAgent, DailyTenantReporterInput } from './agents/reporter/index.js';

const agent = getReporterAgent();

const input: DailyTenantReporterInput = {
  tenantId: "cafe-123",
  tenantName: "Morning Brew Cafe",
  date: "2025-12-05",
  events: [
    { 
      time: "09:02", 
      type: "playlist_assigned", 
      details: "Playlist 'Morning Menu' assigned to device 'Front Window TV'." 
    },
    { 
      time: "09:05", 
      type: "playlist_error", 
      details: "Front Window TV failed to load video: 404 for asset 'menu-hero.mp4'." 
    }
  ],
  stats: {
    playlistAssignments: 1,
    deviceErrors: 1,
    feedbackNegative: 0,
    devicesOffline: 0
  }
};

const response = await agent.generateDailyTenantReport(input);
console.log(response.contentMd); // Markdown report
console.log(response.title);     // Report title
console.log(response.scope);     // "tenant_activity"
console.log(response.tags);      // "playlist_assigned,playlist_error"
```

### Storing Reports

The generated report can be stored in the `TenantReport` model:

```typescript
import { prisma } from '@prisma/client';
import { getReporterAgent } from './agents/reporter/index.js';

const agent = getReporterAgent();
const response = await agent.generateDailyTenantReport(input);

// Store in database
await prisma.tenantReport.create({
  data: {
    tenantId: input.tenantId,
    kind: 'daily_tenant',
    periodKey: input.date,
    title: response.title,
    contentMd: response.contentMd,
    scope: response.scope,
    tags: response.tags,
  }
});
```

## Report Format

The Reporter Agent generates markdown reports with the following structure:

```markdown
# Daily Activity Report – Tenant: {tenantName} ({date})

## Overview
Brief summary of the day's activity...

## Key Events
- [Time] Event description...
- [Time] Event description...

## Issues
- Issue description (if any)...

## Suggested Actions
1. Action item 1
2. Action item 2
...
```

## Prompts

### System Prompt

The system prompt (`DAILY_TENANT_REPORTER_SYSTEM_PROMPT`) instructs the LLM to:
- Generate human-readable markdown reports
- Target non-technical store owners and operators
- Follow a consistent structure (Overview, Key Events, Issues, Suggested Actions)
- Not invent events that aren't in the input
- Explicitly state when there were no issues or no events

### Example Input

See `DAILY_TENANT_REPORTER_EXAMPLE_INPUT` in `prompts.ts` for the expected input format.

## Integration Points

### ActivityEvent Model

The Reporter Agent consumes data from the `ActivityEvent` model:
- Events are queried by `tenantId` and `occurredAt` date range
- Event `type` and `payload` are used to build event summaries
- Events are aggregated into stats

### TenantReport Model

Generated reports are stored in the `TenantReport` model:
- `kind` - Report type (e.g., "daily_tenant")
- `periodKey` - Time period identifier (e.g., "2025-12-05")
- `contentMd` - Generated markdown content
- `scope` - Report scope (e.g., "tenant_activity")
- `tags` - Event types for filtering

### RAG Integration

Reports can be ingested into the RAG knowledge base:
- Reports are stored with `scope: "tenant_activity"`
- Can be queried via RAG system for historical context
- Supports tenant-specific knowledge retrieval

## Implementation Details

### LLM Configuration

- **Model**: Uses the default text engine (typically GPT-4o-mini)
- **Temperature**: 0.3 (lower for more consistent, factual reports)
- **Max Tokens**: 2000 (sufficient for daily reports)

### Error Handling

The agent handles:
- Empty event arrays (reports "no recorded events")
- Missing stats (uses defaults)
- LLM errors (propagates with context)

## Future Enhancements

- [ ] Support for weekly/monthly reports
- [ ] Device-specific reports
- [ ] Playlist summary reports
- [ ] Custom report templates
- [ ] Report scheduling
- [ ] Email delivery of reports
- [ ] Report comparison (day-over-day, week-over-week)
- [ ] Trend analysis in reports

## Notes

- Reports are generated on-demand
- No caching is implemented (can be added for performance)
- Reports are deterministic based on input (same input = same report)
- Markdown format allows for easy rendering in dashboards
- Tags enable quick filtering and categorization

