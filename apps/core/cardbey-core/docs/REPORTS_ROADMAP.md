# Reports System Roadmap

## Overview

This document outlines the phased implementation plan for the Cardbey Reports system, from basic automation to advanced AI-powered insights.

---

## Phase 1.1: Scheduler – Daily/Weekly Automation

### Goal
Automate the generation of daily and weekly tenant reports using a scheduled job system.

### Current Status
- ✅ Report generation services implemented (`reportService.js`)
- ✅ Manual generation endpoints exist (`POST /api/admin/tenants/:tenantId/reports/daily`, `/weekly`)
- ✅ Script exists for manual execution (`scripts/generateDailyReports.ts`)
- ⏳ **TODO**: Automated scheduler integration

### Tasks

1. **Scheduler Setup**
   - [ ] Configure cron job or scheduled task runner
   - [ ] Set up daily report generation (runs at 00:00 UTC or configurable time)
   - [ ] Set up weekly report generation (runs Monday 00:00 UTC)
   - [ ] Add error handling and retry logic
   - [ ] Add logging for scheduled runs

2. **Integration Points**
   - [ ] Integrate with existing scheduler infrastructure (if available)
   - [ ] Add health checks for scheduler
   - [ ] Add monitoring/alerts for failed runs

3. **Configuration**
   - [ ] Make schedule times configurable via environment variables
   - [ ] Support timezone configuration
   - [ ] Add feature flag to enable/disable automated reports

### Deliverables
- Automated daily reports generated for all active tenants
- Automated weekly reports generated every Monday
- Scheduler monitoring dashboard or logs
- Documentation for schedule configuration

### Success Criteria
- Daily reports appear automatically in Insights → Reports
- Weekly reports appear every Monday
- No manual intervention required
- Failed runs are logged and can be retried

---

## Phase 1.2: RAG Indexing – Reports Feed AskCardbey AI

### Goal
Make generated reports searchable and queryable through the RAG system so users can ask AI questions about their historical activity.

### Current Status
- ✅ RAG system exists (`ragService.js`)
- ✅ Reports stored in `TenantReport` model with `contentMd` field
- ✅ Reports have `scope: "tenant_activity"` and tags
- ⏳ **TODO**: Ingest reports into RAG knowledge base

### Tasks

1. **Report Ingestion**
   - [ ] Create ingestion script to process `TenantReport` records
   - [ ] Chunk report markdown content appropriately (preserve structure)
   - [ ] Generate embeddings for report chunks
   - [ ] Store chunks in `RagChunk` table with:
     - `scope: "tenant_activity"`
     - `tenantId` (for tenant-specific queries)
     - `sourcePath` pointing to report ID
     - Metadata linking back to original report

2. **Ingestion Strategy**
   - [ ] Decide on chunking strategy:
     - Option A: One chunk per report section (Overview, Key Events, Issues, Suggested Actions)
     - Option B: Sliding window chunks (overlap for context)
     - Option C: Full report as single chunk (simpler, but less granular)
   - [ ] Handle report updates (re-ingest when report is regenerated)
   - [ ] Add deduplication logic

3. **Integration with AskCardbeyPanel**
   - [ ] Ensure `scope: "tenant_activity"` is available in scope dropdown
   - [ ] Test queries like:
     - "What were the main issues last week?"
     - "Show me device errors from the past month"
     - "What actions were suggested in my daily reports?"
   - [ ] Verify sources link back to original reports

4. **Automation**
   - [ ] Auto-ingest reports after generation (hook into report generation)
   - [ ] Or: Scheduled batch ingestion (e.g., daily at 01:00 UTC)
   - [ ] Add tenant filtering so users only see their own reports

### Deliverables
- Reports are searchable via RAG
- AskCardbeyPanel can answer questions about historical reports
- Sources link back to original reports for verification
- Ingestion runs automatically after report generation

### Success Criteria
- User asks: "What issues did I have last week?" → AI responds with relevant report excerpts
- Sources show links to specific reports
- Tenant isolation works (users only see their own reports)
- Performance is acceptable (< 2s response time)

---

## Phase 2: New Report Types – CAI + Device Health

### Goal
Extend the reporting system to include CAI (Campaign AI) usage reports and Device Health reports.

### Current Status
- ✅ Daily Tenant reports implemented
- ✅ Weekly Tenant reports implemented
- ✅ Daily Device reports implemented
- ⏳ **TODO**: CAI usage reports and Device Health reports

### Tasks

#### 2.1 CAI Usage Reports

1. **Data Collection**
   - [ ] Identify CAI usage events in `ActivityEvent` or existing logs
   - [ ] Aggregate CAI spending by campaign, date, user
   - [ ] Track CAI balance changes over time

2. **Report Generation**
   - [ ] Create `generateCAIUsageReport()` in `reportService.js`
   - [ ] Report should include:
     - Total CAI spent in period
     - Top campaigns by CAI usage
     - CAI balance trends
     - Cost per campaign run
     - Recommendations for optimization
   - [ ] Add endpoint: `POST /api/admin/tenants/:tenantId/reports/cai-usage`
   - [ ] Add to scheduler (weekly or monthly)

3. **Report Kind**
   - [ ] Add `kind: "cai_usage"` to TenantReport
   - [ ] Update frontend filter dropdown

#### 2.2 Device Health Reports

1. **Data Collection**
   - [ ] Aggregate device status events from `ActivityEvent`
   - [ ] Track device uptime, errors, offline periods
   - [ ] Collect device performance metrics (if available)

2. **Report Generation**
   - [ ] Create `generateDeviceHealthReport()` in `reportService.js`
   - [ ] Report should include:
     - Device status summary (online/offline/degraded)
     - Error frequency and types
     - Uptime percentage per device
     - Playlist assignment success rate
     - Recommendations for device maintenance
   - [ ] Add endpoint: `POST /api/admin/tenants/:tenantId/reports/device-health`
   - [ ] Add to scheduler (weekly)

3. **Report Kind**
   - [ ] Add `kind: "device_health"` to TenantReport
   - [ ] Update frontend filter dropdown
   - [ ] Consider device-specific filtering in UI

### Deliverables
- CAI Usage reports available in Insights → Reports
- Device Health reports available in Insights → Reports
- Both report types integrated into scheduler
- Both report types ingestible into RAG

### Success Criteria
- CAI reports show spending trends and optimization opportunities
- Device Health reports identify problematic devices
- Reports are actionable (provide clear next steps)
- Reports appear automatically on schedule

---

## Phase 3: PDF Export – Pay-off for Demo

### Goal
Allow users to export reports as PDF files for sharing, archiving, or presentation purposes.

### Current Status
- ✅ Reports stored as markdown (`contentMd`)
- ✅ Markdown rendering works in UI
- ⏳ **TODO**: PDF generation and export

### Tasks

1. **PDF Generation Library**
   - [ ] Choose PDF library (options: `puppeteer`, `pdfkit`, `jsPDF`, `react-pdf`)
   - [ ] Install and configure library
   - [ ] Create PDF template with:
     - Cardbey branding/header
     - Report title and metadata
     - Formatted markdown content
     - Footer with generation date

2. **Backend Endpoint**
   - [ ] Add `GET /api/reports/:id/export/pdf`
   - [ ] Convert markdown to PDF
   - [ ] Return PDF as binary response with correct headers
   - [ ] Add caching (generate once, cache for 24h)

3. **Frontend Integration**
   - [ ] Add "Export PDF" button to `ReportDetail` component
   - [ ] Handle download (trigger browser download)
   - [ ] Show loading state during generation
   - [ ] Add error handling

4. **Styling**
   - [ ] Ensure PDF matches brand guidelines
   - [ ] Handle code blocks, tables, lists properly
   - [ ] Add page breaks appropriately
   - [ ] Include report metadata (date, tenant, tags)

### Deliverables
- "Export PDF" button on report detail view
- PDFs are properly formatted and branded
- PDFs download successfully
- PDFs can be shared/archived

### Success Criteria
- User clicks "Export PDF" → PDF downloads
- PDF looks professional and matches brand
- PDF contains all report content
- Generation time < 5 seconds

---

## Phase 4: Search + Pagination – UX Polish

### Goal
Improve the reports UI with search functionality and pagination for better usability with large numbers of reports.

### Current Status
- ✅ Basic list view with filters (kind, date range)
- ✅ Report detail view
- ⏳ **TODO**: Search and pagination

### Tasks

1. **Search Functionality**
   - [ ] Add search input to `ReportsPanel`
   - [ ] Search across:
     - Report title
     - Report content (markdown)
     - Tags
   - [ ] Backend: Add `q` query parameter to `GET /api/reports`
   - [ ] Backend: Implement full-text search (SQLite FTS or Prisma search)
   - [ ] Frontend: Debounce search input (300ms)
   - [ ] Frontend: Show search results count

2. **Pagination**
   - [ ] Backend: Add pagination to `GET /api/reports`
     - Query params: `page`, `pageSize` (default: 20)
     - Response: Include `total`, `page`, `pageSize`, `totalPages`
   - [ ] Frontend: Add pagination controls to `ReportsList`
   - [ ] Frontend: Show "Showing X-Y of Z reports"
   - [ ] Frontend: Add "Load More" option (infinite scroll alternative)

3. **Sorting**
   - [ ] Add sort options:
     - Date (newest first / oldest first) - default: newest
     - Title (A-Z / Z-A)
     - Kind
   - [ ] Backend: Add `sortBy` and `sortOrder` query params
   - [ ] Frontend: Add sort dropdown

4. **Performance**
   - [ ] Optimize database queries (add indexes if needed)
   - [ ] Add response caching for list endpoint (if appropriate)
   - [ ] Lazy load report detail (only fetch when selected)

### Deliverables
- Search bar in Reports panel
- Pagination controls
- Sort options
- Improved performance with large datasets

### Success Criteria
- User can search reports by title/content
- Pagination works smoothly
- Sorting works correctly
- Performance remains good with 100+ reports

---

## Phase 5: Weekly AI Summary

### Goal
Generate a high-level AI summary that aggregates insights from multiple daily reports into a single weekly executive summary.

### Current Status
- ✅ Daily reports generated
- ✅ Weekly reports generated (basic)
- ⏳ **TODO**: AI-powered weekly summary

### Tasks

1. **Data Aggregation**
   - [ ] Collect all daily reports for the week
   - [ ] Extract key metrics:
     - Total events
     - Issue count by type
     - Device status changes
     - CAI usage (if available)
   - [ ] Identify trends and patterns

2. **AI Summary Generation**
   - [ ] Create `generateWeeklyAISummary()` function
   - [ ] Use LLM to:
     - Summarize week's activity
     - Identify top issues
     - Highlight positive trends
     - Provide executive-level insights
   - [ ] Format as executive summary (1-2 pages max)

3. **Report Structure**
   - [ ] Weekly summary should include:
     - Executive Summary (AI-generated)
     - Week at a Glance (key metrics)
     - Top Issues (aggregated from daily reports)
     - Trends & Patterns (AI-identified)
     - Recommendations (AI-generated)
     - Daily Report Links (quick access)

4. **Integration**
   - [ ] Update weekly report generation to include AI summary
   - [ ] Or: Create separate `kind: "weekly_ai_summary"` report
   - [ ] Add to scheduler (runs after weekly reports are generated)

5. **RAG Integration**
   - [ ] Ingest weekly AI summaries into RAG
   - [ ] Users can ask: "What were the main trends last week?"
   - [ ] Sources link to weekly summary

### Deliverables
- Weekly AI Summary reports generated automatically
- Summaries provide high-level insights
- Summaries are actionable and executive-friendly
- Summaries are searchable via RAG

### Success Criteria
- Weekly summary appears every Monday
- Summary is concise (1-2 pages)
- Summary identifies key trends and issues
- Summary provides actionable recommendations
- Users can query summaries via AskCardbey AI

---

## Implementation Priority

### High Priority (Phase 1)
1. **Phase 1.1 (Scheduler)** - Critical for automation
2. **Phase 1.2 (RAG Indexing)** - Enables AI queries on reports

### Medium Priority (Phase 2-3)
3. **Phase 3 (PDF Export)** - Important for demos and sharing
4. **Phase 2 (New Report Types)** - Expands reporting capabilities

### Lower Priority (Phase 4-5)
5. **Phase 4 (Search + Pagination)** - UX polish for scale
6. **Phase 5 (Weekly AI Summary)** - Advanced feature

---

## Dependencies

- **Phase 1.1** → No dependencies
- **Phase 1.2** → Requires Phase 1.1 (reports must be generated first)
- **Phase 2** → Requires Phase 1.1 (scheduler for automation)
- **Phase 3** → No dependencies (can be done anytime)
- **Phase 4** → No dependencies (can be done anytime)
- **Phase 5** → Requires Phase 1.1 and Phase 1.2 (needs daily reports + RAG)

---

## Notes

- All phases should maintain backward compatibility
- Each phase should include tests
- Documentation should be updated as features are added
- Consider user feedback after each phase before proceeding

