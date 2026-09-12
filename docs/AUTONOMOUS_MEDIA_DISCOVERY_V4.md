# AUTONOMOUS_MEDIA_DISCOVERY_V4 (DEFERRED)

**Status:** Deferred — not in Rich Media Acquisition V1.

**Program version map (locked):**
- V1 = Rich Media Acquisition foundation (+ approved UI reorganisation corrective slice)
- V2 = Rights + Acquisition Hardening (LOCKED)
- V3 = Media Intelligence & Enrichment (LOCKED)
- V4 = Autonomous Media Discovery (this document — LOCKED / not implemented)

## Intent

Later, Performer may request:

> "ABC Fashion lacks summer promotion video."

Discovery Agent should then:

1. Search approved open sources
2. Rights-filter
3. Rank
4. Create a **review queue**

## Non-goals for V4 (still forbidden without policy)

- Unattended download
- Auto-publish
- Social platform custody scrape
- Permanent Cardbey hosting by default

## V1 hooks already present

- `/api/media-acquisition/search` + observability events
- Review queue (`addToReviewQueue` / resolve)
- Acquisition decision enum (fail-closed)
- Universal Library provenance metadata

Do not implement autonomous loops until this doc is explicitly scheduled.
