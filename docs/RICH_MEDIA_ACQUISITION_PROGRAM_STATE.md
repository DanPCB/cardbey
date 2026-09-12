# RICH MEDIA ACQUISITION — PROGRAM STATE

CURRENT VERSION  
V1

CURRENT GATE  
RICH_MEDIA_ACQUISITION_V1_FINAL_E2E_CLOSURE

V1 STATUS  
PASS

V2 STATUS  
LOCKED — Rights + Acquisition Hardening

V3 STATUS  
LOCKED — Media Intelligence & Enrichment

V4 STATUS  
LOCKED — Autonomous Media Discovery (`docs/AUTONOMOUS_MEDIA_DISCOVERY_V4.md`)

LAST PROVEN RESULT  
RICH_MEDIA_ACQUISITION_V1_PASS

NEXT GATE  
V2 remains LOCKED until explicitly scheduled (source expansion / rights hardening).

Proven in final E2E (`apps/dashboard/.tmp/rma-v1-final-e2e.json`):
- Search → Review → approve (attribution) → Core restart → decision survives
- Acquire → Universal Library read-back (same asset id)
- Duplicate acquire → deduped
- Blocked license cannot approve
- Reference-only path
- Provider isolation (Freesound CONFIG_REQUIRED while others SUCCESS)
- Durable disk-backed review queue

Notes:
- Do not add NASA/Unsplash/new providers in V1 (already deferred to V2).
- Delivery to staging remains a separate repository workflow step.
