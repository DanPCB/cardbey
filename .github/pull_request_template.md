# Pull Request

## Policy Compliance Checklist

### Rule 1: Regression First Policy

- [ ] **Is this fixing a regression?**
  - [ ] If yes, identify last known working commit/version: `_________________`
  - [ ] If yes, identify the exact breaking change: `_________________`
  - [ ] If yes, explain why patching was chosen over rebuilding: `_________________`
  - [ ] If no, explain why this is a new feature (not a rebuild): `_________________`

### Rule 2: No Breaking Changes Without Compatibility

- [ ] **Does this change any API contracts?**
  - [ ] If yes, list changed endpoints/fields: `_________________`
  - [ ] If yes, is versioning included? (e.g., `/api/v2/...`)
  - [ ] If yes, is backward compatibility maintained? (old endpoints still work)
  - [ ] If yes, is migration path documented?
  - [ ] If yes, are clear error codes provided for outdated clients? (e.g., `CLIENT_OUTDATED`)

### Rule 3: Contract Tests are Mandatory

- [ ] **Are contract tests included/updated?**
  - [ ] Pairing flow contract test: `tests/gold_flows/pairing_flow.test.js`
  - [ ] Upload preview flow contract test: `tests/gold_flows/upload_preview_flow.test.js` (if applicable)
  - [ ] Menu extract flow contract test: `tests/gold_flows/menu_extract_flow.test.js` (if applicable)
  - [ ] Device playlist flow contract test: `tests/gold_flows/device_playlist_flow.test.js` (if applicable)
  - [ ] All contract tests pass locally
  - [ ] CI will run contract tests (check CI configuration)

### Rule 4: Debuggability

- [ ] **Are error codes clear and actionable?**
  - [ ] Error codes are structured (not just "500")
  - [ ] Error messages explain what went wrong
  - [ ] Error responses include recovery instructions
  - [ ] Diagnostics endpoint/log bundle available (if applicable)

### Rule 5: Small + Reversible Changes

- [ ] **Is this change small and reversible?**
  - [ ] Change is focused (not massive refactor)
  - [ ] Tests pass before and after
  - [ ] Feature flag gates the change (if applicable)
  - [ ] Rollback path exists

### Rule 6: Upgrade Only When Needed

- [ ] **If this is a rebuild/upgrade:**
  - [ ] Explain why requirements changed materially: `_________________`
  - [ ] Explain why performance/security forces it: `_________________`
  - [ ] Explain why patching would create tech debt: `_________________`
  - [ ] Old behavior continues via compatibility mode: `_________________`
  - [ ] Migration path is documented: `_________________`

---

## Description

<!-- Describe your changes here -->

## Type of Change

- [ ] Bug fix (regression)
- [ ] New feature
- [ ] Breaking change (with compatibility)
- [ ] Refactor (with tests)
- [ ] Documentation

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Contract tests pass
- [ ] Manual testing completed

## Related Issues

<!-- Link to related issues -->

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] CI passes

---

## Policy Violation Declaration

**I confirm that this PR does NOT violate the "NEVER REBUILD ANYTHING DONE" policy.**

If this PR rebuilds a previously working feature, I understand it will be rejected unless:
1. Requirements changed materially, OR
2. Performance/security forces it, OR
3. Patching would create tech debt explosion

AND backward compatibility is maintained.

---

**By submitting this PR, I acknowledge I have read and agree to comply with the policy in `docs/POLICY_NEVER_REBUILD.md`.**















