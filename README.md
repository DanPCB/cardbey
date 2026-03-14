# Cardbey

> **⚠️ CRITICAL: All developers must read [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md) before making any changes.**

## Foundation Rules

This project follows **system-wide development principles** that prevent workflow and logic breaking:

### 🤖 AI-First Development Rule

**If anything can be done by AI, we will find and integrate the APIs. Manual is just an option.**

When building features, prioritize AI integration (OpenAI, Anthropic, etc.) as the primary option, with manual alternatives as fallback. See [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md) for full guidelines.

### 🎯 Core Principle: User Journey Integrity

**Never optimize or dedupe by skipping user-facing steps in a workflow.**

User journeys are intentional sequences. Each step serves a purpose. Breaking this rule causes:
- Confused users
- Incomplete data collection
- Broken state management
- Poor user experience

### The 7 Foundation Rules

1. **Workflow Steps Are Immutable** - Never skip user-facing pages/modals
2. **State vs. Presentation Separation** - Cache data, not UI
3. **Explicit User Intent** - Require active user choices
4. **Progressive Disclosure** - Show information step-by-step
5. **Validation Before Optimization** - Test before optimizing
6. **Type Safety for Workflows** - Use TypeScript to enforce rules
7. **Documentation of Intent** - Document why, not just what

**📖 Full details: [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md)**

---

## Project Structure

```
cardbey/
├── docs/
│   └── DEVELOPMENT_PRINCIPLES.md     # ⭐ Foundation rules (READ FIRST)
├── apps/
│   ├── core/cardbey-core/            # Backend API
│   └── dashboard/cardbey-marketing-dashboard/  # Frontend dashboard
└── packages/                          # Shared packages
```

## Quick Start

### Backend
```bash
cd apps/core/cardbey-core
pnpm install
pnpm dev
```

### Frontend
```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm install
pnpm dev
```

## Development Workflow

### Before Making Changes

1. **Read** [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md)
2. **Map** the user journey for your feature
3. **Identify** which steps are user-facing vs. data-only
4. **Design** type-safe navigation/flow
5. **Write** tests covering all scenarios

### Code Review Checklist

- [ ] No user-facing steps are skipped
- [ ] Navigation uses type-safe helpers (if applicable)
- [ ] User journey is documented
- [ ] Tests cover new user, resume, and edge cases
- [ ] Follows [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md)

### Red Flags (Stop and Review)

If you see these patterns, **STOP** and review:

- ❌ `if (cached) { skipStep(); }`
- ❌ `if (deduped) { navigate('/later-step'); }`
- ❌ `autoSubmit()` or `autoAdvance()`
- ❌ Skipping preview/review/confirmation screens
- ❌ Using state existence to skip UI rendering

## E2E Store Creation (French Baguette)

The store creation flow is validated against the **E2E contract** (Steps 1–6). See [docs/E2E_STORE_CREATION_CONTRACT.md](./docs/E2E_STORE_CREATION_CONTRACT.md) for Definition of Done and invariants.

- **Smoke runner (API):** `pnpm run e2e:french-baguette` (from repo root). Requires API running; with `AUTH_TOKEN` set, creates a job and waits for completion.
- **Health snapshot (debug):** `GET /api/debug/store-creation-health?limit=5` (dev only) — DraftStore status, last AuditEvents, last OrchestratorTask to see which step is blocked.
- **Manual checklist:** Follow Steps 1–6 in the contract; use the health endpoint if a step fails.

## Documentation

- **[DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md)** - ⭐ **Foundation rules (READ FIRST)**
- **[E2E_STORE_CREATION_CONTRACT.md](./docs/E2E_STORE_CREATION_CONTRACT.md)** - Store creation E2E contract and Definition of Done
- [apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_INTEGRITY_RULES.md](./apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_INTEGRITY_RULES.md) - Specific workflow rules
- [apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_PROTECTION_IMPLEMENTED.md](./apps/dashboard/cardbey-marketing-dashboard/WORKFLOW_PROTECTION_IMPLEMENTED.md) - Implementation details

## Contributing

1. Read [DEVELOPMENT_PRINCIPLES.md](./docs/DEVELOPMENT_PRINCIPLES.md)
2. Follow the foundation rules
3. Write tests
4. Document user journeys
5. Submit PR with checklist completed

---

**Remember:** User journeys are designed for a reason. Optimize data and API calls, never user-facing steps.

**When in doubt:** Show the step. It's better to be explicit than to confuse users.





