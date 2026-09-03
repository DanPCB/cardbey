import { describe, expect, it, afterEach } from 'vitest';
import { Features, snapshotFeatures } from '../../config/features.js';
import {
  assertEnrollmentTransition,
  assertSessionTransition,
  assertQuestionReviewTransition,
  assertHostActionAllowed,
  validateSessionSubject,
  normalizeSubjectInputs,
  toPublicLiveSessionDto,
  toOwnerLiveMarketStatusDto,
  isSessionPubliclyVisible,
  LIVE_MARKET_ERROR_CODES,
  LIVE_MARKET_RETENTION,
  LIVE_PROVIDER_READINESS,
  hostCapabilitiesForEnrollment,
  ownerOperationalCapabilities,
} from './domain.js';
import {
  NotConfiguredLiveVideoProvider,
  FakeLiveVideoProvider,
  resolveLiveVideoProvider,
} from './providers.js';

describe('liveMarket feature flags', () => {
  const keys = [
    'ENABLE_LIVE_MARKET_V1',
    'ENABLE_LIVE_MARKET_ADMIN_V1',
    'ENABLE_LIVE_MARKET_OWNER_V1',
    'ENABLE_LIVE_MARKET_PUBLIC_V1',
    'ENABLE_LIVE_BROADCAST_V1',
    'ENABLE_LIVE_CLOUDFLARE_STREAM_V1',
    'ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1',
    'ENABLE_LIVE_RTMPS_HOST_V1',
    'ENABLE_LIVE_STOREFRONT_PLAYER_V1',
    'ENABLE_LIVE_GLOBAL_PLAYER_V1',
    'ENABLE_LIVE_RECORDING_V1',
    'ENABLE_LIVE_REPLAY_V1',
    'ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1',
    'ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1',
    'ENABLE_LIVE_MARKET_GLOBAL_FEED_V1',
    'ENABLE_LIVE_MARKET_REGISTRATION_V1',
    'ENABLE_LIVE_MARKET_REGISTRATION_SUMMARY_V1',
    'ENABLE_LIVE_MARKET_HOST_PARTICIPANTS_V1',
  ];
  const prev = {};

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('defaults all Live Market flags off', () => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    expect(Features.liveMarket.v1).toBe(false);
    expect(Features.liveMarket.adminV1).toBe(false);
    expect(Features.liveMarket.ownerV1).toBe(false);
    expect(Features.liveMarket.publicV1).toBe(false);
    expect(Features.liveMarket.broadcastV1).toBe(false);
    expect(Features.liveMarket.cloudflareStreamV1).toBe(false);
    expect(Features.liveMarket.cloudflareWebRtcV1).toBe(false);
    expect(Features.liveMarket.registrationV1).toBe(false);
    expect(Features.liveMarket.registrationSummaryV1).toBe(false);
    expect(Features.liveMarket.hostParticipantsV1).toBe(false);
    expect(snapshotFeatures().liveMarket).toEqual({
      v1: false,
      adminV1: false,
      ownerV1: false,
      publicV1: false,
      broadcastV1: false,
      cloudflareStreamV1: false,
      cloudflareWebRtcV1: false,
      rtmpsHostV1: false,
      storefrontPlayerV1: false,
      globalPlayerV1: false,
      recordingV1: false,
      replayV1: false,
      storefrontPublishV1: false,
      storefrontConsumeV1: false,
      globalFeedV1: false,
      registrationV1: false,
      registrationSummaryV1: false,
      hostParticipantsV1: false,
    });
  });

  it('registration requires master + storefront consume', () => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ENABLE_LIVE_MARKET_REGISTRATION_V1 = 'true';
    expect(Features.liveMarket.registrationV1).toBe(false);
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_REGISTRATION_V1 = 'true';
    expect(Features.liveMarket.registrationV1).toBe(true);
  });

  it('subflags require master kill switch', () => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ENABLE_LIVE_MARKET_OWNER_V1 = 'true';
    expect(Features.liveMarket.ownerV1).toBe(false);
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    expect(Features.liveMarket.ownerV1).toBe(true);
  });
});

describe('liveMarket enrollment transitions', () => {
  it('allows INVITED → APPROVED → ONBOARDING → ACTIVE → PAUSED → REMOVED', () => {
    expect(assertEnrollmentTransition('INVITED', 'APPROVED').ok).toBe(true);
    expect(assertEnrollmentTransition('APPROVED', 'ONBOARDING').ok).toBe(true);
    expect(assertEnrollmentTransition('ONBOARDING', 'ACTIVE').ok).toBe(true);
    expect(assertEnrollmentTransition('ACTIVE', 'PAUSED').ok).toBe(true);
    expect(assertEnrollmentTransition('PAUSED', 'ACTIVE').ok).toBe(true);
    expect(assertEnrollmentTransition('PAUSED', 'REMOVED').ok).toBe(true);
  });

  it('rejects invalid enrolment transitions', () => {
    const r = assertEnrollmentTransition('REMOVED', 'ACTIVE');
    expect(r.ok).toBe(false);
    expect(r.code).toBe(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION);
    expect(assertEnrollmentTransition('INVITED', 'ACTIVE').ok).toBe(false);
  });
});

describe('liveMarket session transitions', () => {
  it('allows truthful Phase 1 draft schedule cancel path', () => {
    expect(assertSessionTransition('DRAFT', 'SCHEDULED').ok).toBe(true);
    expect(assertSessionTransition('SCHEDULED', 'CANCELLED').ok).toBe(true);
    expect(assertSessionTransition('DRAFT', 'CANCELLED').ok).toBe(true);
  });

  it('rejects DRAFT → LIVE without prepare path', () => {
    const r = assertSessionTransition('DRAFT', 'LIVE');
    expect(r.ok).toBe(false);
    expect(r.code).toBe(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION);
  });

  it('requires CONNECTING before LIVE (provider-backed)', () => {
    expect(assertSessionTransition('SCHEDULED', 'READY').ok).toBe(true);
    expect(assertSessionTransition('READY', 'LIVE').ok).toBe(false);
    expect(assertSessionTransition('READY', 'CONNECTING').ok).toBe(true);
    expect(assertSessionTransition('CONNECTING', 'LIVE').ok).toBe(true);
  });
});

describe('liveMarket question review transitions', () => {
  it('allows Batch A host review graph', () => {
    expect(assertQuestionReviewTransition('NEW', 'REVIEWED').ok).toBe(true);
    expect(assertQuestionReviewTransition('NEW', 'PLANNED').ok).toBe(true);
    expect(assertQuestionReviewTransition('PLANNED', 'ANSWERED').ok).toBe(true);
    expect(assertQuestionReviewTransition('ANSWERED', 'REVIEWED').ok).toBe(true);
    expect(assertQuestionReviewTransition('DISMISSED', 'REVIEWED').ok).toBe(true);
  });

  it('rejects NEW → ANSWERED and unknown states', () => {
    expect(assertQuestionReviewTransition('NEW', 'ANSWERED').ok).toBe(false);
    expect(assertQuestionReviewTransition('NEW', 'DONE').ok).toBe(false);
  });
});

describe('liveMarket host capabilities vs enrolment', () => {
  it('ACTIVE allows schedule/prepare; PAUSED blocks prepare/start/schedule', () => {
    expect(hostCapabilitiesForEnrollment('ACTIVE').canPrepareOrStart).toBe(true);
    expect(hostCapabilitiesForEnrollment('PAUSED').canPrepareOrStart).toBe(false);
    expect(hostCapabilitiesForEnrollment('PAUSED').canCreateOrEditDraft).toBe(true);
    expect(assertHostActionAllowed('PAUSED', 'prepare').code).toBe(
      LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE,
    );
    expect(assertHostActionAllowed('ACTIVE', 'schedule').ok).toBe(true);
    expect(assertHostActionAllowed(null, 'draft').code).toBe(
      LIVE_MARKET_ERROR_CODES.LIVE_STORE_NOT_ENROLLED,
    );
  });

  it('ownerOperationalCapabilities gates prepare/start on provider readiness', () => {
    const activeNoProvider = ownerOperationalCapabilities('ACTIVE', { providerConfigured: false });
    expect(activeNoProvider.canSchedule).toBe(true);
    expect(activeNoProvider.canPrepare).toBe(false);
    expect(activeNoProvider.canStart).toBe(false);

    const paused = ownerOperationalCapabilities('PAUSED', { providerConfigured: true });
    expect(paused.canEditDraft).toBe(true);
    expect(paused.canCancel).toBe(true);
    expect(paused.canSchedule).toBe(false);
    expect(paused.canPrepare).toBe(false);

    const removed = ownerOperationalCapabilities('REMOVED', { providerConfigured: true });
    expect(removed.canCreateDraft).toBe(false);
    expect(removed.canCancel).toBe(false);
  });
});

describe('liveMarket owner status DTO', () => {
  it('returns sanitized ACTIVE status with streamingOperational false', () => {
    const dto = toOwnerLiveMarketStatusDto({
      enabled: true,
      storeId: 'store_1',
      providerConfigured: false,
      enrollment: {
        state: 'ACTIVE',
        allowedSourceLanguages: ['vi'],
        allowedTargetLanguages: ['vi', 'en'],
        automaticReplayPublication: true,
        approvedByActorId: 'actor_secret',
        pausedByActorId: 'actor_pause',
        approvedHostUserIds: ['host_1'],
      },
    });
    expect(dto.enrolled).toBe(true);
    expect(dto.enrollmentState).toBe('ACTIVE');
    expect(dto.capabilities.canSchedule).toBe(true);
    expect(dto.capabilities.canPrepare).toBe(false);
    expect(dto.providerReadiness).toBe(LIVE_PROVIDER_READINESS.NOT_CONFIGURED);
    expect(dto.streamingOperational).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('actor_secret');
    expect(JSON.stringify(dto)).not.toContain('approvedByActorId');
    expect(JSON.stringify(dto)).not.toContain('host_1');
  });

  it('non-enrolled status reports no operational capabilities', () => {
    const dto = toOwnerLiveMarketStatusDto({
      enabled: true,
      storeId: 'store_1',
      providerConfigured: false,
      enrollment: null,
    });
    expect(dto.enrolled).toBe(false);
    expect(dto.enrollmentState).toBeNull();
    expect(dto.capabilities.canCreateDraft).toBe(false);
    expect(dto.capabilities.canSchedule).toBe(false);
  });
});

describe('liveMarket subjects (Product catalog identity)', () => {
  it('accepts PRODUCT and SERVICE subjects that belong to the store', () => {
    expect(
      validateSessionSubject({
        subjectType: 'PRODUCT',
        subjectId: 'p1',
        storeId: 's1',
        product: { id: 'p1', businessId: 's1', catalogItemType: 'product' },
      }).ok,
    ).toBe(true);
    expect(
      validateSessionSubject({
        subjectType: 'SERVICE',
        subjectId: 'svc1',
        storeId: 's1',
        product: { id: 'svc1', businessId: 's1', catalogItemType: 'service' },
      }).ok,
    ).toBe(true);
  });

  it('rejects cross-store and missing subjects', () => {
    expect(
      validateSessionSubject({
        subjectType: 'PRODUCT',
        subjectId: 'p1',
        storeId: 's1',
        product: { id: 'p1', businessId: 'other', catalogItemType: 'product' },
      }).code,
    ).toBe(LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_STORE_MISMATCH);
    expect(
      validateSessionSubject({
        subjectType: 'PRODUCT',
        subjectId: 'missing',
        storeId: 's1',
        product: null,
      }).code,
    ).toBe(LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_NOT_FOUND);
  });

  it('rejects type mismatch when catalogItemType is known', () => {
    expect(
      validateSessionSubject({
        subjectType: 'SERVICE',
        subjectId: 'p1',
        storeId: 's1',
        product: { id: 'p1', businessId: 's1', catalogItemType: 'product' },
      }).code,
    ).toBe(LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_TYPE_MISMATCH);
  });

  it('dedupes subjects deterministically and reports invalid/duplicates', () => {
    const { normalized, duplicates, invalid } = normalizeSubjectInputs([
      { subjectType: 'PRODUCT', subjectId: 'a' },
      { subjectType: 'PRODUCT', subjectId: 'a' },
      { subjectType: 'SERVICE', subjectId: 'b' },
      { subjectType: 'NOPE', subjectId: 'x' },
      { subjectType: 'PRODUCT', subjectId: '' },
    ]);
    expect(normalized).toEqual([
      { subjectType: 'PRODUCT', subjectId: 'a', sortOrder: 0 },
      { subjectType: 'SERVICE', subjectId: 'b', sortOrder: 1 },
    ]);
    expect(duplicates).toHaveLength(1);
    expect(invalid).toHaveLength(2);
  });
});

describe('liveMarket provider ports', () => {
  const prevFake = process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;

  afterEach(() => {
    if (prevFake === undefined) delete process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;
    else process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER = prevFake;
  });

  it('NotConfigured returns LIVE_PROVIDER_NOT_CONFIGURED on prepare/start', async () => {
    const p = new NotConfiguredLiveVideoProvider();
    await expect(p.prepareSession({ sessionId: 'x', storeId: 's', hostUserId: 'u' })).rejects.toMatchObject({
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
    });
    await expect(p.startSession({ sessionId: 'x', storeId: 's' })).rejects.toMatchObject({
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
    });
  });

  it('resolveLiveVideoProvider defaults to not configured', () => {
    delete process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;
    expect(resolveLiveVideoProvider()).toBeInstanceOf(NotConfiguredLiveVideoProvider);
  });

  it('FakeLiveVideoProvider requires explicit connected confirmation for LIVE tests', async () => {
    const fake = new FakeLiveVideoProvider();
    const prepared = await fake.prepareSession({
      sessionId: 'sess-1',
      storeId: 's1',
      hostUserId: 'u1',
    });
    expect(prepared.status).toBe('prepared');
    const started = await fake.startSession({ sessionId: 'sess-1', storeId: 's1' });
    expect(started.status).toBe('prepared');
    const live = fake.confirmConnected('sess-1');
    expect(live.status).toBe('live');
  });
});

describe('liveMarket public DTO + retention contracts', () => {
  it('hides drafts and strips internal fields', () => {
    expect(isSessionPubliclyVisible('DRAFT')).toBe(false);
    expect(
      toPublicLiveSessionDto({
        id: '1',
        storeId: 's',
        title: 't',
        state: 'DRAFT',
        hostUserId: 'secret',
        providerExternalRef: 'mux_xxx',
      }),
    ).toBeNull();

    const dto = toPublicLiveSessionDto(
      {
        id: '1',
        storeId: 's',
        title: 'Live nails',
        description: 'vi stream',
        sourceLanguage: 'vi',
        viewerLanguages: ['en'],
        scheduledStartAt: '2030-08-14T00:00:00.000Z',
        startedAt: null,
        endedAt: null,
        state: 'SCHEDULED',
        storefrontPublicationStatus: 'PUBLISHED',
        hostUserId: 'secret',
        providerExternalRef: 'mux_xxx',
        failureReason: 'nope',
      },
      {
        storeName: 'Demo',
        enrollmentState: 'ACTIVE',
        subjects: [{ subjectType: 'SERVICE', subjectId: 'p1', sortOrder: 0 }],
      },
    );
    expect(dto).toMatchObject({
      id: '1',
      sessionId: '1',
      storeId: 's',
      storeName: 'Demo',
      title: 'Live nails',
      description: 'vi stream',
      sourceLanguage: 'vi',
      viewerLanguages: ['en'],
      scheduledStartAt: '2030-08-14T00:00:00.000Z',
      scheduledAt: '2030-08-14T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      state: 'SCHEDULED',
      storefrontPublicationStatus: 'PUBLISHED',
      publicState: 'upcoming',
      providerConfirmedLive: false,
      providerConnected: false,
      streamingOperational: false,
      subjects: [{ subjectType: 'SERVICE', subjectId: 'p1', sortOrder: 0 }],
    });
    expect(dto.hostUserId).toBeUndefined();
    expect(dto.providerExternalRef).toBeUndefined();
  });

  it('assertCanPublishStorefront and waiting public state', async () => {
    const { assertCanPublishStorefront, normalizePublicStorefrontLiveState } = await import(
      './domain.js'
    );
    expect(
      assertCanPublishStorefront({
        session: { state: 'DRAFT', title: 't', scheduledStartAt: '2030-01-01T00:00:00.000Z' },
        enrollmentState: 'ACTIVE',
      }).ok,
    ).toBe(false);
    expect(
      assertCanPublishStorefront({
        session: {
          state: 'SCHEDULED',
          title: 't',
          scheduledStartAt: '2030-01-01T00:00:00.000Z',
          storefrontPublicationStatus: 'HIDDEN',
        },
        enrollmentState: 'ACTIVE',
      }).ok,
    ).toBe(true);
    expect(
      normalizePublicStorefrontLiveState({
        state: 'SCHEDULED',
        scheduledStartAt: '2000-01-01T00:00:00.000Z',
        storefrontPublicationStatus: 'PUBLISHED',
      }),
    ).toBe('waiting_for_host');
    expect(
      normalizePublicStorefrontLiveState({
        state: 'SCHEDULED',
        scheduledStartAt: '2030-01-01T00:00:00.000Z',
        storefrontPublicationStatus: 'HIDDEN',
      }),
    ).toBe('unavailable');
    expect(
      normalizePublicStorefrontLiveState(
        {
          state: 'LIVE',
          scheduledStartAt: '2000-01-01T00:00:00.000Z',
          storefrontPublicationStatus: 'PUBLISHED',
        },
        { providerConfirmedLive: false },
      ),
    ).toBe('waiting_for_host');
  });

  it('documents retention targets', () => {
    expect(LIVE_MARKET_RETENTION.rawProviderRecordingHours).toBe(24);
    expect(LIVE_MARKET_RETENTION.publicLiveChatHours).toBe(24);
    expect(LIVE_MARKET_RETENTION.automaticReplayPublicationDefault).toBe(true);
    expect(LIVE_MARKET_RETENTION.replayMustCopyBeforeRawDeletion).toBe(true);
  });
});
