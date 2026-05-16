/**
 * Dev system missions guard route tests.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPrivilegedVerificationCookieValue,
  PRIVILEGED_VERIFICATION_COOKIE_NAME,
} from '../../services/security/privilegedVerificationService.js';

const { proposalStore, securityEventStore, prismaMock, passwordHash } = vi.hoisted(() => {
  const proposalStore = [];
  const securityEventStore = [];
  const passwordHash = '$2a$04$XWl8e1MnUfuh2Ya1SJxCMuZDQdGrAVOmRX3DvXFmMJZTUxgJpHSNS';
  const executionPreviewStore = [];

  return {
    proposalStore,
    securityEventStore,
    passwordHash,
    executionPreviewStore,
    prismaMock: {
      devSystemProposal: {
        async deleteMany() {
          proposalStore.length = 0;
          return { count: 0 };
        },
        async create({ data }) {
          const record = {
            id: `proposal-${proposalStore.length + 1}`,
            ...data,
            createdAt: new Date(`2026-01-0${proposalStore.length + 1}T00:00:00.000Z`),
            updatedAt: new Date(`2026-01-0${proposalStore.length + 1}T00:00:00.000Z`),
          };
          proposalStore.unshift(record);
          return record;
        },
        async findMany({ take }) {
          return proposalStore.slice(0, take ?? proposalStore.length);
        },
        async findUnique({ where }) {
          return proposalStore.find((item) => item.id === where.id) ?? null;
        },
        async update({ where, data }) {
          const record = proposalStore.find((item) => item.id === where.id);
          if (!record) {
            throw new Error('not_found');
          }
          Object.assign(record, data, { updatedAt: new Date('2026-03-02T00:00:00.000Z') });
          return record;
        },
      },
      devSystemExecutionPreview: {
        async create({ data }) {
          const record = {
            id: `preview-${executionPreviewStore.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          executionPreviewStore.unshift(record);
          return record;
        },
      },
      securityEvent: {
        async create({ data }) {
          const now = new Date();
          const record = {
            id: `security-${securityEventStore.length + 1}`,
            isRead: false,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          securityEventStore.unshift(record);
          return record;
        },
        async findFirst({ where }) {
          return (
            securityEventStore.find(
              (item) =>
                item.type === where.type &&
                item.severity === where.severity &&
                item.source === where.source &&
                item.route === where.route &&
                item.actorUserId === where.actorUserId &&
                item.actorEmail === where.actorEmail
            ) ?? null
          );
        },
        async findMany({ take }) {
          return securityEventStore.slice(0, take ?? securityEventStore.length);
        },
        async update({ where, data }) {
          const record = securityEventStore.find((item) => item.id === where.id);
          if (!record) {
            throw new Error('not_found');
          }
          Object.assign(record, data, { updatedAt: new Date('2026-03-01T00:00:00.000Z') });
          return record;
        },
      },
      user: {
        async findUnique() {
          return {
            id: 'test-user',
            passwordHash,
            role: 'admin',
          };
        },
      },
    },
  };
});

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    req.user = { id: 'test-user', role, email: 'admin@cardbey.local', passwordHash };
    return next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    return next();
  },
}));

import devSystemMissionsRoutes from '../devSystemMissions.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dev', devSystemMissionsRoutes);
  return app;
}

function buildValidPayload() {
  return {
    missionType: 'system',
    taskType: 'code_task',
    title: 'Guarded refactor proposal',
    objective: 'Prepare a safe proposal for a future internal code task.',
    allowedPaths: ['apps/core/cardbey-core/src/routes'],
  };
}

describe('POST /api/dev/system-missions/code-task', () => {
  beforeEach(async () => {
    await prismaMock.devSystemProposal.deleteMany();
    securityEventStore.length = 0;
  });

  it('accepts an admin with a valid proposal-only payload', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('proposal_only');
    expect(res.body.guard).toEqual({
      access: 'passed',
      payload: 'passed',
      scope: 'passed',
    });
    expect(res.body.execution.status).toBe('guarded_not_executed');
  });

  it('rejects a non-admin actor', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'viewer')
      .send(buildValidPayload());

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(securityEventStore[0].type).toBe('admin.guard.non_admin_attempt');
  });

  it('rejects requests without allowedPaths', async () => {
    const app = makeApp();
    const payload = buildValidPayload();
    delete payload.allowedPaths;

    const res = await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'admin')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
  });

  it('rejects dangerous allowed paths', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'admin')
      .send({
        ...buildValidPayload(),
        allowedPaths: ['apps/core/cardbey-core/src/kernel'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('forbidden_allowed_path');
    expect(securityEventStore[0].type).toBe('admin.guard.forbidden_path');
  });

  it('rejects non proposal-only modes', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'admin')
      .send({
        ...buildValidPayload(),
        mode: 'execute',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_mode');
  });

  it('persists a guarded proposal for an admin', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.proposal.status).toBe('guarded');
    expect(res.body.proposal.mode).toBe('proposal_only');
    expect(res.body.proposal.type).toBe('code_task_proposal');

    const stored = await prismaMock.devSystemProposal.findUnique({
      where: { id: res.body.proposal.id },
    });
    expect(stored).toBeTruthy();
    expect(stored.title).toBe(buildValidPayload().title);
    expect(securityEventStore[0].type).toBe('admin.guard.proposal_created');
  });

  it('rejects invalid payload before persistence', async () => {
    const app = makeApp();
    const payload = buildValidPayload();
    delete payload.allowedPaths;

    const res = await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(payload);

    expect(res.status).toBe(400);
    expect(proposalStore.length).toBe(0);
  });

  it('lists recent stored proposals', async () => {
    const app = makeApp();

    await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send({
        ...buildValidPayload(),
        title: 'First proposal',
      });

    await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send({
        ...buildValidPayload(),
        title: 'Second proposal',
      });

    const res = await request(app)
      .get('/api/dev/system-missions/code-task/proposals?limit=20')
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items[0].title).toBe('Second proposal');
    expect(res.body.items[1].title).toBe('First proposal');
  });

  it('allows admin to list recent security events', async () => {
    const app = makeApp();

    await request(app)
      .post('/api/dev/system-missions/code-task')
      .set('x-test-role', 'admin')
      .send({
        ...buildValidPayload(),
        allowedPaths: ['apps/core/cardbey-core/src/kernel'],
      });

    const res = await request(app)
      .get('/api/dev/security-events?limit=20')
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.items[0].type).toBe('admin.guard.forbidden_path');
  });

  it('blocks non-admin from listing security events', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/dev/security-events?limit=20')
      .set('x-test-role', 'viewer');

    expect(res.status).toBe(403);
    expect(securityEventStore[0].type).toBe('admin.dev_console.access_denied');
  });

  it('allows admin to approve a guarded proposal', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    const verifyRes = await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.headers['set-cookie']?.[0]).toContain(`${PRIVILEGED_VERIFICATION_COOKIE_NAME}=`);

    const res = await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .send({ reason: 'Scope reviewed and safe for future manual approval path.' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.proposal.status).toBe('approved');
    expect(res.body.proposal.reviewDecisionReason).toBe('Scope reviewed and safe for future manual approval path.');
    expect(securityEventStore[0].type).toBe('admin.proposal.approved');
  });

  it('allows admin to reject a guarded proposal', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    const res = await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/reject`)
      .set('x-test-role', 'admin')
      .send({ reason: 'Rejected for follow-up scope clarification.' });

    expect(res.status).toBe(200);
    expect(res.body.proposal.status).toBe('rejected');
    expect(securityEventStore[0].type).toBe('admin.proposal.rejected');
  });

  it('rejects repeat review decisions on already-decided proposals', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .send({});

    const res = await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/reject`)
      .set('x-test-role', 'admin')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('invalid_review_state');
    expect(securityEventStore[0].type).toBe('admin.proposal.review_invalid_state');
  });

  it('blocks non-admin from approving proposals', async () => {
    const app = makeApp();
    const createRes = await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    const res = await request(app)
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'viewer')
      .send({});

    expect(res.status).toBe(403);
    expect(securityEventStore[0].type).toBe('admin.guard.non_admin_attempt');
  });

  it('blocks admin review without recent privileged verification', async () => {
    const app = makeApp();
    const createRes = await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    const res = await request(app)
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('privileged_verification_required');
    expect(res.body.details.reason).toBe('required');
    expect(securityEventStore[0].type).toBe('admin.privileged_verification.required');
  });

  it('emits a failed verification event for bad password re-confirmation', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
    expect(securityEventStore[0].type).toBe('admin.privileged_verification.failed');
  });

  it('emits a success event and grants a short-lived privileged marker', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verification.method).toBe('password_reconfirm');
    expect(res.headers['set-cookie']?.[0]).toContain(`${PRIVILEGED_VERIFICATION_COOKIE_NAME}=`);
    expect(securityEventStore[0].type).toBe('admin.privileged_verification.succeeded');
  });

  it('blocks expired privileged verification markers', async () => {
    const app = makeApp();
    const createRes = await request(app)
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    const expiredCookieValue = createPrivilegedVerificationCookieValue({
      actor: { id: 'test-user', role: 'admin', email: 'admin@cardbey.local' },
      maxAgeSeconds: -10,
    });

    const res = await request(app)
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .set('Cookie', `${PRIVILEGED_VERIFICATION_COOKIE_NAME}=${expiredCookieValue}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('privileged_verification_required');
    expect(res.body.details.reason).toBe('expired');
    expect(securityEventStore[0].type).toBe('admin.privileged_verification.expired');
  });

  it('allows dry-run preview for approved proposals with recent privileged verification', async () => {
    const app = makeApp();
    const agent = request.agent(app);

    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .send({});

    const res = await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/dry-run`)
      .set('x-test-role', 'admin')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.preview.mode).toBe('dry_run_only');
    expect(res.body.preview.proposalId).toBe(createRes.body.proposal.id);
    expect(res.body.preview.resultPreview.futureExecutionNotes).toBeTruthy();
    expect(securityEventStore[0].type).toBe('admin.execution_dry_run.generated');
  });

  it('blocks dry-run preview when proposal is not approved', async () => {
    const app = makeApp();
    const agent = request.agent(app);

    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    const res = await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/dry-run`)
      .set('x-test-role', 'admin')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('proposal_not_approved');
    expect(securityEventStore[0].type).toBe('admin.execution_dry_run.invalid_state');
  });

  it('blocks dry-run preview when privileged verification is missing', async () => {
    const app = makeApp();
    const agent = request.agent(app);

    const createRes = await agent
      .post('/api/dev/system-missions/code-task/proposals')
      .set('x-test-role', 'admin')
      .send(buildValidPayload());

    await agent
      .post('/api/dev/privileged/verify')
      .set('x-test-role', 'admin')
      .send({ method: 'password_reconfirm', password: 'correct-password' });

    await agent
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/approve`)
      .set('x-test-role', 'admin')
      .send({});

    const res = await request(app)
      .post(`/api/dev/system-missions/code-task/proposals/${createRes.body.proposal.id}/dry-run`)
      .set('x-test-role', 'admin')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('privileged_verification_required');
    expect(securityEventStore[0].type).toBe('admin.execution_dry_run.verification_required');
  });
});
