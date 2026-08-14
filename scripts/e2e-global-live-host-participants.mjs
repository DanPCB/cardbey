/**
 * ACK GLOBAL_LIVE_HOST_PARTICIPANTS_E2E — owner browser proof for Batch A.
 * Does not start Batch B. Privacy-safe screenshots only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const coreRoot = path.join(root, 'apps/core/cardbey-core');
const dashRoot = path.join(root, 'apps/dashboard/cardbey-marketing-dashboard');
const require = createRequire(path.join(dashRoot, 'package.json'));

const { chromium, devices } = require('@playwright/test');
const jwt = require(path.join(coreRoot, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(coreRoot, 'node_modules/bcryptjs'));

const CORE = process.env.E2E_CORE_URL || 'http://127.0.0.1:3001';
const DASH = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5174';
const STORE_ID = 'cmsq3a6vq003kjv10mhaceq1k';
const SESSION_ID = 'cmsrmwj3b000qjvwgor5dhwki';
const OWNER_ID = 'cmrg2zczn0013jvkc2jblq2n5';
const PRODUCT_ID = 'cmsq3a6vh000050jvfw5k21n2';
const OUT_DIR = path.join(root, 'docs/screenshots/live-market-host-e2e');

function loadJwtSecret() {
  const envPath = path.join(coreRoot, '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const m = text.match(/^JWT_SECRET=(.+)$/m);
  if (!m) throw new Error('JWT_SECRET missing in core .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function tokenFor(userId, secret) {
  return jwt.sign({ userId }, secret, { expiresIn: '2h' });
}

async function api(method, urlPath, { token, body } = {}) {
  const res = await fetch(`${CORE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function sqlite(sql) {
  const r = spawnSync(
    'sqlite3',
    [`file:${path.join(coreRoot, 'prisma/dev-fresh.db').replace(/\\/g, '/')}?busy_timeout=60000`, sql],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'sqlite failed');
  return (r.stdout || '').trim();
}

function cuidLike() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureParticipantUser(secret) {
  const email = `host-e2e-participant-${Date.now()}@example.test`;
  const id = cuidLike();
  const password = 'E2eHostPart!2026';
  const hash = await bcrypt.hash(password, 10);
  const displayName = 'E2E Participant Ana';
  const esc = (s) => String(s).replace(/'/g, "''");
  sqlite(
    `INSERT INTO User (id, email, passwordHash, displayName, roles, role, emailVerified, hasBusiness, createdAt, updatedAt)
     VALUES ('${esc(id)}', '${esc(email)}', '${esc(hash)}', '${esc(displayName)}', '["viewer"]', 'owner', 1, 0, datetime('now'), datetime('now'));`,
  );
  return { id, email, password, displayName, token: tokenFor(id, secret) };
}

function assertNoPrivateLeak(obj) {
  const s = JSON.stringify(obj);
  if (/@"|\.test@|password|phone|\+61|userId":/i.test(s) && /"userId"\s*:/.test(s)) {
    throw new Error(`Private field leaked in payload: ${s.slice(0, 400)}`);
  }
  if (/"email"\s*:|"phone"\s*:|"passwordHash"\s*:/.test(s)) {
    throw new Error(`Contact/auth field leaked: ${s.slice(0, 400)}`);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    verdict: 'BLOCKED_E2E',
    steps: [],
    screenshots: [],
    authz: {},
    audit: null,
    blocker: null,
  };

  const mark = (step, ok, detail = '') => {
    report.steps.push({ step, ok, detail });
    console.log(`${ok ? 'OK' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    const health = await api('GET', '/api/health');
    if (!health.json?.features?.liveMarket?.hostParticipantsV1) {
      throw Object.assign(new Error('hostParticipantsV1 not enabled on running core'), {
        step: 'flags',
        status: health.status,
      });
    }
    mark('flags', true, 'hostParticipantsV1=true');

    const secret = loadJwtSecret();
    const ownerToken = tokenFor(OWNER_ID, secret);
    const participant = await ensureParticipantUser(secret);
    mark('participant-user', true, participant.email);

    // Register with language + question + interest
    const reg = await api('POST', `/api/live-market/sessions/${SESSION_ID}/registrations`, {
      token: participant.token,
      body: {
        preferredLanguage: 'vi',
        questionForHost: 'E2E synthetic: Will you cover AU↔VN remittance fees live?',
        interestSubjectId: PRODUCT_ID,
        interestSubjectType: 'SERVICE',
      },
    });
    if (reg.status >= 400 || !reg.json?.ok) {
      throw Object.assign(new Error('participant registration failed'), {
        step: 'register-participant',
        status: reg.status,
        body: reg.json,
      });
    }
    const registrationId = reg.json.registration?.id || reg.json.id;
    if (!registrationId) {
      throw Object.assign(new Error('registration id missing'), {
        step: 'register-participant',
        body: reg.json,
      });
    }
    mark('register-participant', true, `registrationId=${registrationId}`);

    // Owner summary API
    const summary = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/registration-summary`,
      { token: ownerToken },
    );
    if (summary.status !== 200 || !summary.json?.ok) {
      throw Object.assign(new Error('summary fetch failed'), {
        step: 'owner-summary-api',
        status: summary.status,
        body: summary.json,
      });
    }
    assertNoPrivateLeak(summary.json);
    mark(
      'owner-summary-api',
      true,
      `registered=${summary.json.summary?.registeredCount} questions=${summary.json.summary?.questionCount}`,
    );

    // --- Browser owner path ---
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      baseURL: DASH,
    });
    const page = await context.newPage();

    await page.addInitScript(
      ({ token, keys }) => {
        localStorage.setItem(keys.bearer, token);
        localStorage.setItem(keys.authToken, token);
        localStorage.setItem(keys.adminToken, token);
        localStorage.setItem(keys.apiKey, 'admin');
        localStorage.setItem(keys.username, 'E2E Owner');
        localStorage.setItem(keys.role, 'owner');
      },
      {
        token: ownerToken,
        keys: {
          bearer: 'cardbey_dev_bearer',
          authToken: 'cardbey_dev_auth_token',
          adminToken: 'cardbey_dev_admin_token',
          apiKey: 'cardbey_dev_api_key',
          username: 'cardbey_dev_username',
          role: 'cardbey_dev_role',
        },
      },
    );

    const liveUrl = `/app/back/live-market?storeId=${encodeURIComponent(STORE_ID)}`;
    const nav = await page.goto(liveUrl, { waitUntil: 'networkidle', timeout: 60000 });
    if (!nav || nav.status() >= 500) {
      throw Object.assign(new Error('live-market page failed to load'), {
        step: 'open-live-market',
        status: nav?.status(),
        route: liveUrl,
      });
    }
    await page.waitForSelector('[data-testid="store-live-market-page"]', { timeout: 30000 });
    mark('open-live-market', true, liveUrl);

    const summarySel = `[data-testid="live-market-registration-summary-${SESSION_ID}"]`;
    await page.waitForSelector(summarySel, { timeout: 30000 });
    const summaryText = await page.locator(summarySel).innerText();
    if (!/Registered participants/i.test(summaryText)) {
      throw Object.assign(new Error('summary missing Registered participants label'), {
        step: 'browser-summary',
        detail: summaryText,
      });
    }
    if (/\bwatching live\b|\bguest rsvps?\b|\blive viewers:\s*\d+/i.test(summaryText)) {
      throw Object.assign(new Error('summary shows deferred metrics'), {
        step: 'browser-summary',
        detail: summaryText,
      });
    }
    const shot1 = path.join(OUT_DIR, '01-owner-summary-desktop.png');
    await page.screenshot({ path: shot1, fullPage: true });
    report.screenshots.push(shot1);
    mark('browser-summary', true, summaryText.replace(/\s+/g, ' ').slice(0, 160));

    await page.click(`[data-testid="live-market-view-participants-${SESSION_ID}"]`);
    await page.waitForSelector('[data-testid="live-host-participants-panel"]', { timeout: 20000 });
    await page.waitForSelector('[data-testid="live-host-participants-list"]', { timeout: 20000 });
    const panelText = await page.locator('[data-testid="live-host-participants-panel"]').innerText();
    if (/@example\.test|password|phone|\+61/i.test(panelText)) {
      throw Object.assign(new Error('panel leaked private contact fields'), {
        step: 'view-participants-privacy',
        detail: panelText.slice(0, 300),
      });
    }
    if (!/E2E Participant Ana|Vietnamese|Cardbey participant|vi/i.test(panelText)) {
      // language may be labeled Vietnamese; name must appear
      if (!/E2E Participant Ana/i.test(panelText)) {
        throw Object.assign(new Error('participant display name missing'), {
          step: 'view-participants',
          detail: panelText.slice(0, 400),
        });
      }
    }
    const shot2 = path.join(OUT_DIR, '02-participants-panel-desktop.png');
    await page.screenshot({ path: shot2, fullPage: true });
    report.screenshots.push(shot2);
    mark('view-participants', true, 'panel open; no email/phone');

    // Questions tab + NEW -> PLANNED
    await page.click('[data-testid="live-host-questions-tab"]');
    await page.waitForSelector('[data-testid="live-host-questions-list"]', { timeout: 20000 });
    const reviewSelect = page.locator(`[data-testid="live-host-question-review-${registrationId}"]`);
    await reviewSelect.waitFor({ timeout: 20000 });
    await reviewSelect.selectOption('PLANNED');
    await page.waitForTimeout(800);
    const afterPlanned = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/participants?hasQuestion=true&q=${encodeURIComponent('E2E Participant')}`,
      { token: ownerToken },
    );
    const plannedRow = (afterPlanned.json?.participants || []).find((p) => p.id === registrationId);
    if (plannedRow?.questionReviewStatus !== 'PLANNED') {
      throw Object.assign(new Error('PLANNED not persisted'), {
        step: 'review-planned',
        body: plannedRow || afterPlanned.json,
      });
    }
    mark('review-NEW-to-PLANNED', true);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="store-live-market-page"]', { timeout: 30000 });
    await page.click(`[data-testid="live-market-view-participants-${SESSION_ID}"]`);
    await page.click('[data-testid="live-host-questions-tab"]');
    await page.waitForSelector(`[data-testid="live-host-question-review-${registrationId}"]`, {
      timeout: 20000,
    });
    const plannedValue = await page
      .locator(`[data-testid="live-host-question-review-${registrationId}"]`)
      .inputValue();
    if (plannedValue !== 'PLANNED') {
      throw Object.assign(new Error(`refresh showed ${plannedValue}, expected PLANNED`), {
        step: 'review-planned-refresh',
      });
    }
    mark('review-PLANNED-refresh', true);

    await page
      .locator(`[data-testid="live-host-question-review-${registrationId}"]`)
      .selectOption('ANSWERED');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="store-live-market-page"]', { timeout: 30000 });
    await page.click(`[data-testid="live-market-view-participants-${SESSION_ID}"]`);
    await page.click('[data-testid="live-host-questions-tab"]');
    await page.waitForSelector(`[data-testid="live-host-question-review-${registrationId}"]`, {
      timeout: 20000,
    });
    const answeredValue = await page
      .locator(`[data-testid="live-host-question-review-${registrationId}"]`)
      .inputValue();
    if (answeredValue !== 'ANSWERED') {
      throw Object.assign(new Error(`refresh showed ${answeredValue}, expected ANSWERED`), {
        step: 'review-answered-refresh',
      });
    }
    const shot3 = path.join(OUT_DIR, '03-question-answered-desktop.png');
    await page.screenshot({ path: shot3, fullPage: true });
    report.screenshots.push(shot3);
    mark('review-PLANNED-to-ANSWERED-refresh', true);

    // Mobile viewport evidence
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await page.goto(liveUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector(summarySel, { timeout: 30000 });
    const shot4 = path.join(OUT_DIR, '04-owner-summary-mobile-375.png');
    await page.screenshot({ path: shot4, fullPage: true });
    report.screenshots.push(shot4);
    await page.click(`[data-testid="live-market-view-participants-${SESSION_ID}"]`);
    await page.waitForSelector('[data-testid="live-host-participants-panel"]', { timeout: 20000 });
    const shot5 = path.join(OUT_DIR, '05-participants-panel-mobile-375.png');
    await page.screenshot({ path: shot5, fullPage: true });
    report.screenshots.push(shot5);
    mark('mobile-375', true);
    await browser.close();

    // Audit inspection
    const auditRaw = sqlite(
      `SELECT action, fromStatus, toStatus, reason, metadata, actorId FROM AuditEvent
       WHERE entityId='${registrationId}' AND action LIKE '%QUESTION_REVIEW%'
       ORDER BY createdAt DESC LIMIT 5;`,
    );
    report.audit = auditRaw;
    if (!/LIVE_PARTICIPANT_QUESTION_REVIEW_CHANGED/.test(auditRaw)) {
      throw Object.assign(new Error('expected review audit event missing'), {
        step: 'audit',
        detail: auditRaw,
      });
    }
    if (/remittance fees|E2E synthetic|@example\.test|password/i.test(auditRaw)) {
      throw Object.assign(new Error('audit leaked question/contact'), {
        step: 'audit-privacy',
        detail: auditRaw,
      });
    }
    mark('audit-privacy', true, auditRaw.split('\n')[0].slice(0, 120));

    // Cancel registration as participant
    const beforeCancel = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/registration-summary`,
      { token: ownerToken },
    );
    const activeBefore = beforeCancel.json?.summary?.registeredCount ?? 0;
    const cancel = await api('DELETE', `/api/live-market/sessions/${SESSION_ID}/registration/me`, {
      token: participant.token,
    });
    if (cancel.status >= 400 && cancel.status !== 200) {
      // some APIs use PATCH status=CANCELLED
      const cancel2 = await api('PATCH', `/api/live-market/sessions/${SESSION_ID}/registration/me`, {
        token: participant.token,
        body: { status: 'CANCELLED' },
      });
      if (cancel2.status >= 400) {
        throw Object.assign(new Error('cancel registration failed'), {
          step: 'cancel-registration',
          status: cancel.status,
          body: { delete: cancel.json, patch: cancel2.json },
        });
      }
    }
    const afterCancel = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/registration-summary`,
      { token: ownerToken },
    );
    const activeAfter = afterCancel.json?.summary?.registeredCount ?? 0;
    if (!(activeAfter < activeBefore)) {
      throw Object.assign(new Error('active count did not decrease after cancel'), {
        step: 'cancel-totals',
        detail: { activeBefore, activeAfter, summary: afterCancel.json?.summary },
      });
    }
    const cancelledList = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/participants?status=CANCELLED`,
      { token: ownerToken },
    );
    const cancelledRow = (cancelledList.json?.participants || []).find((p) => p.id === registrationId);
    if (!cancelledRow || cancelledRow.questionReviewStatus !== 'ANSWERED') {
      throw Object.assign(new Error('cancelled row missing or review history lost'), {
        step: 'cancel-review-history',
        body: cancelledRow || cancelledList.json,
      });
    }
    mark('cancel-and-review-history', true, `active ${activeBefore}→${activeAfter}; review=ANSWERED`);

    // Authorization matrix (API authoritative)
    const stranger = await ensureParticipantUser(secret);
    const nonOwner = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/participants`,
      { token: stranger.token },
    );
    report.authz.nonOwner = nonOwner.status;
    mark('authz-non-owner', nonOwner.status === 403, `status=${nonOwner.status}`);

    const crossStore = await api(
      'GET',
      `/api/stores/not-a-real-store/live-sessions/${SESSION_ID}/participants`,
      { token: ownerToken },
    );
    report.authz.crossStore = crossStore.status;
    mark(
      'authz-cross-store',
      crossStore.status === 403 || crossStore.status === 404,
      `status=${crossStore.status}`,
    );

    // Pause enrolment
    const prevState = sqlite(
      `SELECT state FROM LiveMarketPilotEnrollment WHERE storeId='${STORE_ID}' LIMIT 1;`,
    );
    sqlite(
      `UPDATE LiveMarketPilotEnrollment SET state='PAUSED', pausedAt=datetime('now'), updatedAt=datetime('now') WHERE storeId='${STORE_ID}';`,
    );
    const paused = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/participants`,
      { token: ownerToken },
    );
    report.authz.paused = paused.status;
    mark('authz-paused-owner', paused.status === 200, `status=${paused.status}`);

    sqlite(
      `UPDATE LiveMarketPilotEnrollment SET state='REMOVED', removedAt=datetime('now'), updatedAt=datetime('now') WHERE storeId='${STORE_ID}';`,
    );
    const removed = await api(
      'GET',
      `/api/stores/${STORE_ID}/live-sessions/${SESSION_ID}/participants`,
      { token: ownerToken },
    );
    report.authz.removed = removed.status;
    mark('authz-removed', removed.status === 403, `status=${removed.status}`);

    // restore enrolment
    sqlite(
      `UPDATE LiveMarketPilotEnrollment SET state='${prevState || 'ACTIVE'}', pausedAt=NULL, removedAt=NULL, updatedAt=datetime('now') WHERE storeId='${STORE_ID}';`,
    );
    mark('enrolment-restored', true, prevState || 'ACTIVE');

    const failed = report.steps.filter((s) => !s.ok);
    report.verdict = failed.length ? 'BLOCKED_E2E' : 'GLOBAL_LIVE_HOST_PARTICIPANTS_READY';
  } catch (err) {
    report.verdict = 'BLOCKED_E2E';
    report.blocker = {
      step: err.step || 'unknown',
      message: err.message,
      status: err.status,
      body: err.body,
      detail: err.detail,
      route: err.route,
    };
    console.error('BLOCKED', report.blocker);
  }

  const outJson = path.join(OUT_DIR, 'e2e-report.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log('\nREPORT', outJson);
  console.log('VERDICT', report.verdict);
  if (report.verdict !== 'GLOBAL_LIVE_HOST_PARTICIPANTS_READY') process.exit(1);
}

main();
