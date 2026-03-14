# Contributing to Cardbey

## ⚠️ CRITICAL: Read This First

**All contributors must read [DEVELOPMENT_PRINCIPLES.md](./DEVELOPMENT_PRINCIPLES.md) before making any changes.**

These principles prevent workflow and logic breaking across the entire system.

## Foundation Rules

### The Golden Rule
**Never optimize or dedupe by skipping user-facing steps in a workflow.**

### Quick Checklist

Before submitting a PR:

- [ ] Read [DEVELOPMENT_PRINCIPLES.md](./DEVELOPMENT_PRINCIPLES.md)
- [ ] Mapped the user journey for your feature
- [ ] Identified which steps are user-facing vs. data-only
- [ ] Used type-safe navigation helpers (if applicable)
- [ ] Written tests covering all scenarios
- [ ] Documented the user journey
- [ ] No user-facing steps are skipped
- [ ] Code review checklist completed

## Development Process

1. **Read Principles** - [DEVELOPMENT_PRINCIPLES.md](./DEVELOPMENT_PRINCIPLES.md)
2. **Plan Feature** - Map user journey, identify steps
3. **Implement** - Follow type safety, use helpers
4. **Test** - Cover new user, resume, edge cases
5. **Document** - Explain user journey
6. **Review** - Complete checklist

## Database schema (Prisma)

We use **two Prisma schemas**: SQLite (dev + unit tests) and Postgres (contract tests + staging/prod). They must stay in sync.

### Schema change rule

If you modify **`apps/core/cardbey-core/prisma/sqlite/schema.prisma`**, you **MUST**:

1. Apply the same model changes to **`apps/core/cardbey-core/prisma/postgres/schema.prisma`**.
2. Create a Postgres migration:
   ```bash
   cd apps/core/cardbey-core
   npx prisma migrate dev --schema prisma/postgres/schema.prisma --name <descriptive_name>
   ```
   (Requires a running Postgres instance or use the same pattern as contract tests.)

Otherwise unit tests (SQLite, `db push`) may pass but **contract tests and staging will fail or drift**. CI will fail if the Postgres schema does not match the migration history (see contract-tests workflow).

## Red Flags

If your code has these patterns, **STOP** and review:

- ❌ `if (cached) { skipStep(); }`
- ❌ `if (deduped) { navigate('/later-step'); }`
- ❌ `autoSubmit()` or `autoAdvance()`
- ❌ Skipping preview/review/confirmation screens
- ❌ Using state existence to skip UI rendering

## Questions?

- See [DEVELOPMENT_PRINCIPLES.md](./DEVELOPMENT_PRINCIPLES.md) for guidelines
- Create an issue tagged `workflow-integrity` for violations
- Ask in code review if unsure

---

**Remember:** User journeys are designed for a reason. Optimize data and API calls, never user-facing steps.
















