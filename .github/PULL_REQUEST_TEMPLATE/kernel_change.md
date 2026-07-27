# Kernel Change Pull Request

> **Label:** `kernel-change`  
> **Governance:** [`docs/CONSTITUTION_REVIEW.md`](../../docs/CONSTITUTION_REVIEW.md)

This PR touches kernel behaviour, intake authority, runtime contracts, or plugin interfaces. It requires Constitution Review before merge.

---

## Kernel design principle

> **The kernel exists to reduce future complexity, not to enable today's feature.**

**Will this make the next ten plugins simpler?**

- [ ] Yes — explain below
- [ ] No — stop; implement as a plugin instead

Explanation: `_________________`

---

## Constitution Review

| Check | Question | Answer |
|-------|----------|--------|
| ☐ | **Platform Constitution** — Does this change alter platform philosophy? | |
| ☐ | **Cognitive Constitution** — Does this alter how Cardbey understands reality? | |
| ☐ | **Execution Constitution** — Does this alter execution laws or certification gates? | |
| ☐ | **Plugin Rule** — Could this have been implemented as a plugin instead? | |
| ☐ | **Kernel Change** — Is this really kernel work? If yes, why? | |
| ☐ | **Migration** — Does this require recertification of any mission family? | |

### kernel-change detail

1. Which execution or cognitive law is affected? `_________________`
2. Which plugin interfaces change? `_________________`
3. Which certified mission families are impacted? `_________________`
4. What is the migration / recertification plan? `_________________`

---

## Description

<!-- What changed and why -->

## Testing

- [ ] Unit tests added/updated
- [ ] Integration / regression tests added/updated
- [ ] Dashboard runtime-state tests updated (if applicable)
- [ ] Certified mission families manually smoke-tested: `_________________`

## Related documents

- [ ] `docs/PLATFORM_CONSTITUTION.md`
- [ ] `docs/COGNITIVE_KERNEL_SPEC.md`
- [ ] `docs/EXECUTION_KERNEL_V1_CERTIFICATION.md`
- [ ] `docs/MISSION_PLUGIN_STATUS.md` updated (if certification impact)
