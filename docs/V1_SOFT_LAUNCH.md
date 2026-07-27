# Cardbey V1 Soft Launch

## Release notes

### New features

- **Store creation** — Create and publish stores with AI assistance
- **Document ingest** — Upload business documents to create products
- **Content generation** — Generate tags, descriptions, and social content
- **Promotion creation** — Create and manage promotions for your store
- **Fix issues** — Completeness audit with prioritised fixes (`audit_store_completeness` + health report)

### Known limitations

- Video generation requires video provider setup (OpenAI, Kling, or mock URL)
- C-Net deployment requires `CNET_API_KEY` and device pairing
- Scan card / OCR feature requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

### Supported flows

| Flow | Status |
|------|--------|
| Create store | ✅ |
| Create mini website | ✅ |
| Create promotion | ✅ |
| Generate tags | ✅ |
| Rewrite descriptions | ✅ |
| Ingest business document | ✅ |
| Fix issues (store audit) | ✅ |
| Generate social content | ✅ |
| Scan card to create product | ✅ (with vision API keys) |

---

## P0 fixes (this release)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `diagnose_store` had no executor | Route Fix issues → `analyze_store` / `audit_store_completeness` |
| 2 | `generate_social_posts` was honestBlocker | Real executor via `llmGateway` |
| 3 | No env visibility for stubbed features | `/api/status/features` + UI badges |

---

## Go / no-go checklist

### Prerequisites

| Check | Status |
|-------|--------|
| All P0 fixes applied | ✅ |
| Environment badges added | ✅ |
| UI labels updated | ✅ |
| Staging smoke tests passed | ☐ (run before prod) |
| Core health OK | ☐ |
| SLO ≥ 95% | ☐ |
| All agents healthy | ☐ |
| Documentation updated | ✅ |

### UI updates

| Page | Action |
|------|--------|
| Performer Console | Fix issues prefill, feature badges on More missions |
| Quick Actions | Video pill shows Requires setup when provider missing |
| More Missions | Badges on C-Net, video, scan card, social |

### Verification commands (staging)

```bash
# Fix issues → audit_store_completeness
curl -X POST https://cardbey-core-staging.onrender.com/api/performer/intake/v2 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Fix issues with my store","storeId":"<store-id>"}'

# Generate social content
curl -X POST https://cardbey-core-staging.onrender.com/api/performer/intake/v2 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Generate social content for my store","storeId":"<store-id>"}'

# Feature status
curl https://cardbey-core-staging.onrender.com/api/status/features
```

### Go / no-go decision

| Criterion | Status |
|-----------|--------|
| Core features working | ☐ |
| P0 fixes applied | ✅ |
| Staging stable | ☐ |
| SLO ≥ 95% | ☐ |
| Release notes ready | ✅ |
| **Decision** | **HOLD** until staging smoke + SLO verified |
