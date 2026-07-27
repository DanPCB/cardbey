// DANH: skill-runtime-phase2
import { describe, it, expect, vi } from 'vitest';
import { IntentDisambiguator } from '../intent_disambiguator.js';
import { CARDBEY_INTENT_PATTERNS } from '../patterns.js';
import { buildSkillContext } from '../skillContextBuilder.js';
import { dispatchWithRuntime } from '../dispatchWithRuntime.js';
import { runtimeRegistry } from '../runtimeRegistry.js';
import type { SkillContext } from '../types.js';

// ── helpers ──────────────────────────────────────────────────────────────
function disambiguator(): IntentDisambiguator {
  const d = new IntentDisambiguator();
  for (const p of CARDBEY_INTENT_PATTERNS) d.register(p);
  return d;
}

function ctx(query: string, overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    query,
    userId: 'u1',
    conversationId: 'c1',
    userHasProducts: false,
    metadata: {},
    ...overrides,
  };
}

const prismaWithProducts = {
  business: { findUnique: async () => ({ type: 'salon', _count: { products: 3 } }) },
};
const prismaThrows = {
  business: {
    findUnique: async () => {
      throw new Error('db down');
    },
  },
};

// ── CONTEXT BUILDER ────────────────────────────────────────────────────────
describe('buildSkillContext', () => {
  it('enriches userHasProducts (and businessCategory) when storeId present', async () => {
    const c = await buildSkillContext(
      { intentLabel: 'Add a product', storeId: 's1', userId: 'u9', missionId: 'm1' },
      prismaWithProducts as any
    );
    expect(c.query).toBe('Add a product');
    expect(c.userId).toBe('u9');
    expect(c.conversationId).toBe('m1'); // missionId is the conversation handle here
    expect(c.userHasProducts).toBe(true);
    expect(c.metadata.businessCategory).toBe('salon');
    expect(c.metadata.storeId).toBe('s1');
  });

  it('returns base context and makes NO DB call when storeId absent', async () => {
    const findUnique = vi.fn(async () => ({ type: 'x', _count: { products: 9 } }));
    const c = await buildSkillContext(
      { intentLabel: 'Setup a loyalty program' },
      { business: { findUnique } } as any
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(c.userHasProducts).toBe(false);
    expect(c.metadata.storeId).toBeNull();
  });

  it('returns base context when prisma throws (non-fatal enrichment)', async () => {
    const c = await buildSkillContext(
      { intentLabel: 'Add a product', storeId: 's1' },
      prismaThrows as any
    );
    expect(c.userHasProducts).toBe(false);
    expect(c.metadata.businessCategory).toBeNull();
  });

  it('falls back through intentLabel → userMessage for query', async () => {
    const c = await buildSkillContext({ userMessage: 'hello there' }, prismaWithProducts as any);
    expect(c.query).toBe('hello there');
  });
});

// ── NEW PATTERNS ─────────────────────────────────────────────────────────--
describe('Phase 2 intent patterns', () => {
  it('"Add a product called Classic Manicure $45" → catalog_management (≥0.65)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('Add a product called Classic Manicure $45'));
    expect(resolved?.intent).toBe('catalog_management');
    expect(resolved!.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('"Sync my restaurant menu" → menu_sync (≥0.65)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('Sync my restaurant menu'));
    expect(resolved?.intent).toBe('menu_sync');
    expect(resolved!.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('"Book an appointment for tomorrow" → booking_management (≥0.65)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('Book an appointment for tomorrow'));
    expect(resolved?.intent).toBe('booking_management');
    expect(resolved!.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('"What\'s missing from my store profile" → store_health (≥0.65)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx("What's missing from my store profile"));
    expect(resolved?.intent).toBe('store_health');
    expect(resolved!.confidence).toBeGreaterThanOrEqual(0.65);
  });

  // DANH: skill-runtime-phase3 — weight bump (0.55 → 0.65) lets bare "discount"
  // clear the 0.6 threshold even without a product bonus.
  it('"Create a 20% discount" (userHasProducts: false) → create_promotion', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('Create a 20% discount')); // userHasProducts: false (default)
    expect(resolved?.intent).toBe('create_promotion');
    expect(resolved!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('"Product analytics for last month" → null (below threshold, not catalog)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('Product analytics for last month', { userHasProducts: true }));
    expect(resolved).toBeNull();
  });

  it('"How many bookings did I get" → null (below threshold, not booking)', async () => {
    const d = disambiguator();
    const resolved = await d.resolve(ctx('How many bookings did I get'));
    expect(resolved).toBeNull();
  });
});

// ── FALLTHROUGH ─────────────────────────────────────────────────────────---
describe('fallthrough behavior', () => {
  it('unknown intent → runtimeRegistry.dispatch returns null', async () => {
    const skill = await runtimeRegistry.dispatch(ctx('xyzzy random gibberish nonsense'));
    expect(skill).toBeNull();
  });

  it('legacy SkillRouter import remains intact and callable', async () => {
    const mod = await import('../../skills/index.js');
    expect(mod.skillRouter).toBeTruthy();
    expect(typeof mod.skillRouter.route).toBe('function');
  });
});

// ── INTEGRATION (dispatchWithRuntime) ───────────────────────────────────────
describe('dispatchWithRuntime', () => {
  it('loyalty intent → dispatched via skill_runtime with skillId setup_loyalty_program', async () => {
    const result = await dispatchWithRuntime(
      { intentLabel: 'Setup a loyalty program', storeId: 's1' },
      prismaWithProducts as any
    );
    expect(result).not.toBeNull();
    expect(result!.dispatchedVia).toBe('skill_runtime');
    expect(result!.skillId).toBe('setup_loyalty_program');
    expect(result!.state).toBe('completed');
  });

  it('unknown intent → returns null (legacy path)', async () => {
    const result = await dispatchWithRuntime(
      { intentLabel: 'xyzzy random gibberish nonsense' },
      prismaWithProducts as any
    );
    expect(result).toBeNull();
  });

  it('runtime throwing → returns null (non-fatal fallthrough)', async () => {
    // A prisma whose `business` accessor throws forces buildSkillContext to
    // throw outside its inner try, exercising dispatchWithRuntime's catch.
    const evilPrisma = {
      get business() {
        throw new Error('catastrophic prisma access');
      },
    };
    const result = await dispatchWithRuntime(
      { intentLabel: 'Setup a loyalty program', storeId: 's1' },
      evilPrisma as any
    );
    expect(result).toBeNull();
  });
});

// ── DANH: skill-runtime-phase3 — route-shape integration ────────────────────
// The route passes the tool name as `intentLabel` (the builder maps
// intentLabel → query; it does not read a `query` field), plus storeId/userId/
// sessionId. These tests mirror that exact call shape.
describe('dispatchWithRuntime (route call shape)', () => {
  it('loyalty intent with enrichment → skill_runtime / setup_loyalty_program', async () => {
    const prisma = {
      business: { findUnique: async () => ({ type: 'beauty', _count: { products: 3 } }) },
    };
    const result = await dispatchWithRuntime(
      { intentLabel: 'Setup a loyalty campaign', storeId: 'store-1', userId: 'user-1', sessionId: null },
      prisma as any
    );
    expect(result).not.toBeNull();
    expect(result!.skillId).toBe('setup_loyalty_program');
    expect(result!.dispatchedVia).toBe('skill_runtime');
  });

  it('unknown intent → returns null (legacy path, no throw)', async () => {
    const result = await dispatchWithRuntime(
      { intentLabel: 'random unknown xyz', storeId: null },
      null as any
    );
    expect(result).toBeNull();
  });
});

// ── DANH: skill-runtime-phase4 — cooperative gate ───────────────────────────
// Faithful mirror of the gate wired into performerIntakeV2Routes.js. The real
// gate's predicate is `Boolean(skillRegistry.findByTrigger(intentLabel))`, which
// is exactly how SkillRouter.route() decides `matched` (and is side-effect-free,
// unlike route() which executes the skill). These tests assert the decision
// table: legacy match → runtime skipped; legacy miss → runtime attempted;
// runtime miss → fall through to the existing tool dispatch.
async function runCooperativeGate({
  intentLabel,
  findByTrigger,
  dispatchFn,
}: {
  intentLabel: string;
  findByTrigger: (label: string) => unknown;
  dispatchFn: () => Promise<any>;
}) {
  const legacyWouldMatch = Boolean(findByTrigger(intentLabel));
  if (!legacyWouldMatch) {
    const runtimeResult = await dispatchFn();
    if (runtimeResult) {
      return {
        handled: true,
        via: 'skill_runtime' as const,
        value: { toolResult: runtimeResult.result, payload: runtimeResult },
      };
    }
  }
  // Gate did not short-circuit → the existing skillRouter.route(intentLabel,
  // fullCtx) call runs next (legacy match executes; legacy miss → tool dispatch).
  return { handled: false as const, via: legacyWouldMatch ? ('legacy' as const) : ('tool' as const) };
}

describe('cooperative gate (phase4)', () => {
  it('legacy match → runtime NOT called, legacy path used', async () => {
    const findByTrigger = vi.fn(() => ({ name: 'campaign', triggers: ['create_campaign'] }));
    const dispatchFn = vi.fn(async () => ({ result: {}, skillId: 'should_not_be_used' }));

    const out = await runCooperativeGate({ intentLabel: 'create_campaign', findByTrigger, dispatchFn });

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(out.handled).toBe(false);
    expect(out.via).toBe('legacy');
  });

  it('legacy miss → runtime called once, runtime result returned', async () => {
    const findByTrigger = vi.fn(() => null);
    const runtime = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'setup_loyalty_program',
      state: 'completed',
      result: { skillId: 'setup_loyalty_program' },
    };
    const dispatchFn = vi.fn(async () => runtime);

    const out = await runCooperativeGate({
      intentLabel: 'setup_loyalty_campaign',
      findByTrigger,
      dispatchFn,
    });

    expect(dispatchFn).toHaveBeenCalledTimes(1);
    expect(out.handled).toBe(true);
    expect(out.via).toBe('skill_runtime');
    expect(out.value!.payload.skillId).toBe('setup_loyalty_program');
  });

  it('legacy miss + runtime miss → falls through to tool dispatch', async () => {
    const findByTrigger = vi.fn(() => null);
    const dispatchFn = vi.fn(async () => null);

    const out = await runCooperativeGate({ intentLabel: 'unknown_tool_xyz', findByTrigger, dispatchFn });

    expect(dispatchFn).toHaveBeenCalledTimes(1);
    expect(out.handled).toBe(false);
    expect(out.via).toBe('tool');
  });
});
