# Mission 1000 — 90-Day Plan

**Audit date:** 2026-07-21  
**Overall readiness entering plan:** ~41%  
**Strategy:** Connect existing durable paths; instrument outcomes; assist first 10; delay new platforms.

---

## Phase overview

| Phase | Days | Goal | Businesses | Assistance |
|---|---|---|---|---|
| **A** | 0–30 | Prove closed loop | 10 | Highly assisted |
| **B** | 31–60 | Reduce assistance | 100 capacity | Semi-assisted |
| **C** | 61–90 | Reliability for scale | Path ready for 1,000 | Mostly self-serve foundation |

Go/no-go gates between phases are mandatory.

---

## Phase A — Prove with 10 assisted pilots (Days 0–30)

### Outcomes
- 10 businesses complete GP-01 (import→publish→QR→enquiry→respond)  
- Median assisted import→publish ≤15 min  
- Zero SME 404s to Business Import Studio  
- Enquiry email/in-app notify works on staging + production SMTP  
- Completeness checklist prevents empty public shares  
- Scorecard events emitting for import/publish/enquiry  

### Weekly plan

| Week | Focus | Deliverables |
|---|---|---|
| 1 | Instrumentation + dead-route guard | P0-01, P0-02; staging smoke |
| 2 | Notify + role clarity + completeness | P0-04, P0-05, P0-06 |
| 3 | Durable Performer import (minimal) | P0-03 spike; 3 dry-run businesses |
| 4 | Run 10 pilots | Runbook; scorecard snapshot; bugfix only |

### Dependencies
- Staging SMTP + Places key (if used)  
- Staff runbook and Slack/support channel  
- Dashboard submodule revision pinned  

### Release gates (enter Phase A pilots)
- [ ] GP-01 passes on staging twice  
- [ ] No Studio 404 on business intent  
- [ ] Quote notify observed  
- [ ] Feature flags for Kernel/DI documented (prefer Kernel off until P0-03 stable)

### Go / No-go → Phase B
**Go if:** ≥7/10 pilots published usable storefronts; ≥5/10 received a real or simulated enquiry with owner response; no data-loss incident from memory Kernel in pilot path.  
**No-go if:** Median time &gt;25 min assisted; empty storefronts shared; enquiries lost.

### Postpone in Phase A
- Week-1 auto pack (start design only)  
- Discovery Intelligence Panel  
- Creator Production / Content Graph  
- Social OAuth  
- ROI revenue claims  

---

## Phase B — Reduce assistance for 100 (Days 31–60)

### Outcomes
- Week-1 content pack usable for ≥50% of new publishes  
- Kernel→DraftStore enabled on staging for URL/PDF; correction median trending ≤15  
- Enquiry respond fully in Performer  
- Minimal Value card (measured + estimated time) live  
- SEO OG tags on storefront  
- Mission resume on for staging cohort  
- Places → from-discovery one click  

### Weekly plan

| Week | Focus | Deliverables |
|---|---|---|
| 5 | Week-1 pack MVP | P1-01 thin slice (7 drafts, no external publish) |
| 6 | Kernel staging enablement | P1-02; fixture beauty+café |
| 7 | Respond UX + Value card | P1-03, P1-04 |
| 8 | SEO + resume + Places bridge; soft 100 capacity | P1-05–07; ops playbook |

### Dependencies
- Phase A go  
- Video optional (mock OK)  
- Cost caps draft for LLM/OCR  

### Release gates
- [ ] Week-1 approve &lt;15 min in 5 assisted tests  
- [ ] Value card shows Measured vs Estimated only  
- [ ] Kernel persist resume demo recorded  
- [ ] Support load model for 100 documented  

### Go / No-go → Phase C
**Go if:** Import success ≥85% on staging cohort; notify reliability ≥95%; support hours per business trending down ≥40% vs Phase A.  
**No-go if:** Memory data loss; Week-1 quality rejected by owners; attribution pressure for fake ROI.

### Postpone in Phase B
- Live IG/FB import  
- Push notifications  
- Full social publish  
- DI panel production  
- Merchant revenue confirm (design OK)

---

## Phase C — Path ready for 1,000 (Days 61–90)

### Outcomes
- Scheduled morning briefing email with quiet hours  
- Decision on DI: Prisma durable **or** permanently marketplace-only  
- Merchant-confirmed influenced revenue flow  
- Quotas for LLM/vision/video  
- Persona hardening (duration options, variants, service areas)  
- Vietnamese seller packaging for AU (vi Mission path + AUD)  
- Production smoke + scorecard automated weekly  

### Weekly plan

| Week | Focus | Deliverables |
|---|---|---|
| 9 | Morning email briefing | P2-01 |
| 10 | DI decision + quotas | P2-02, P2-06 |
| 11 | Influenced revenue confirm + persona QA | P2-04, P2-08 |
| 12 | i18n/AU pack + scale readiness review | P2-09; exec go/no-go for 1,000 marketing |

### Dependencies
- Phase B go  
- Email deliverability  
- Legal review of value claims  

### Release gates (claim “ready for 1,000”)
- [ ] Self-serve GP-01 success ≥90% on staging sample n≥30  
- [ ] Median import ≤8 min  
- [ ] Median corrections ≤10  
- [ ] Enquiry notify ≥99% delivery attempt success  
- [ ] Morning briefing open rate ≥40% (email+in-app)  
- [ ] No memory-backed path in Mission critical chain  
- [ ] Scorecard automated; no unverified revenue in UI  

### Go / No-go — market 1,000
**Go:** All gates green + support model staffed.  
**No-go:** Any critical path still memory-default; ROI UI mislabels estimates as verified.

### Postpone past day 90
- Content Graph platform  
- Creator Production as SME dependency  
- Full messaging inbox  
- Aggressive social scraping  

---

## Cross-phase workstreams

| Stream | Owner focus | Notes |
|---|---|---|
| Connect | Import↔Draft↔Publish↔Notify↔Brief | Highest leverage |
| Durability | Kill memory on critical path | P0-03, P2-02 |
| Instrument | Scorecard events | P0-01 forever |
| Assist | Pilot runbooks | Phase A–B |
| Resist | New platform layers | Intent rewrite, Studio rebuild, DI vanity enable |

---

## Flag policy during the 90 days

| Flag / system | Phase A | Phase B | Phase C |
|---|---|---|---|
| Discovery Intelligence Panel | OFF | OFF | ON only if Prisma |
| Business Import Kernel DraftStore adapter | OFF or staging-only experiment | Staging ON | Prod gradual |
| Creator Production / Content Graph | OFF | OFF | OFF for SME path |
| Creative Factory V1 | ON if stable | ON | ON |
| USE_LOYALTY_SPINE | Match Render (ON) | ON | ON |
| REPORT_SCHEDULER / briefing cron | OFF | Prep | ON |
| Social mock | Accept | Accept | Replace or hide |

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pilots blocked by empty catalogs | Completeness checklist + staff OCR help |
| Cost blowups (vision/video) | Quotas; mock video; poster-first Week-1 |
| Submodule drift | Pin dashboard SHA in release notes |
| Over-claiming ROI | Scorecard labeling rules; legal review |
| Scope creep into Creator platform | Separate creator GTM track |

---

## Success snapshot (day 90)

If plan executes:

| Stage | Target readiness |
|---|---|
| 0 | ~75% |
| 1 | ~70% |
| 2 | ~85% |
| 3 | ~55% |
| 4 | ~65% |
| 5 | ~45% |
| 6 | ~60% |
| **Overall** | **~65–70%** |

Still not “done,” but credible for scaling toward 1,000 with controlled acquisition and honest value reporting.

---

## Immediate next implementation phase (recommended)

**Scope (2–3 weeks): Phase A Week 1–2 only**

1. P0-01 instrumentation  
2. P0-02 Studio navigation guard  
3. P0-04 enquiry notification  
4. P0-05 completeness checklist  
5. P0-06 role intent chooser  
6. Start P0-03 design spike (do not ship half-memory)

**Explicitly out of scope for next phase:** Week-1 pack, Kernel prod enablement, DI panel, ROI revenue, Creator Production.
