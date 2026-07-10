import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_PIPELINE_STAGES,
  createArtifactDefinition,
  normalizeArtifactDefinition,
} from '../ArtifactDefinition.js';
import { createArtifactBlueprint } from '../ArtifactBlueprint.js';
import { resolveArtifactType, TOOL_TO_ARTIFACT_TYPE } from '../artifactTypes.js';
import { listRegisteredArtifactTypes } from '../ArtifactRegistry.js';
import { planArtifactBlueprint } from '../ArtifactPlanner.js';
import { runValidationPack } from '../validationPacks/index.js';

describe('Universal Artifact Factory', () => {
  it('exposes canonical pipeline stages', () => {
    expect(ARTIFACT_PIPELINE_STAGES).toEqual([
      'resolve_context',
      'research',
      'collect_inputs',
      'create_blueprint',
      'owner_review',
      'generate',
      'validate',
      'revision',
      'approval',
      'publish',
      'learn',
    ]);
  });

  it('maps legacy tools to artifact types', () => {
    expect(resolveArtifactType('create_video')).toBe('promotion_video');
    expect(resolveArtifactType('generate_poster')).toBe('poster');
    expect(TOOL_TO_ARTIFACT_TYPE.setup_loyalty_program).toBe('loyalty_program');
  });

  it('creates artifact definitions', () => {
    const def = createArtifactDefinition({
      type: 'promotion_graphic',
      objective: 'July promo',
      owner: 'user-1',
      storeId: 'store-1',
    });
    expect(def.artifactId).toMatch(/^art-/);
    expect(def.type).toBe('promotion_graphic');
  });

  it('normalizes API payloads', () => {
    const def = normalizeArtifactDefinition({
      artifactType: 'website',
      objective: 'Luxury spa site',
      userId: 'user-2',
    });
    expect(def?.type).toBe('website');
    expect(def?.owner).toBe('user-2');
  });

  it('plans blueprints from context', () => {
    const definition = createArtifactDefinition({
      type: 'promotion_video',
      objective: 'Summer reel',
      owner: 'user-1',
    });
    const blueprint = planArtifactBlueprint(
      definition,
      {
        userId: 'user-1',
        authenticated: true,
        accountId: 'user-1',
        storeId: 'store-1',
        missionId: 'mission-1',
        mission: null,
        business: { name: 'Spa Co' },
        brandProfile: null,
        locale: 'en-AU',
        uploads: {},
        campaign: {},
        loyalty: {},
        catalog: {},
        services: {},
        extras: {},
      },
      { assets: [], byRole: {} },
      { scenes: [{ id: 's1' }] },
    );
    expect(blueprint.type).toBe('promotion_video');
    expect(blueprint.structure).toMatchObject({ storeName: 'Spa Co' });
  });

  it('registers seeded artifact adapters', () => {
    const types = listRegisteredArtifactTypes();
    expect(types).toContain('promotion_video');
    expect(types).toContain('loyalty_program');
    expect(types).toContain('menu');
  });

  it('runs validation packs', () => {
    const findings = runValidationPack('promotion_graphic', { url: 'https://example.com/a.png' });
    expect(findings.some((f) => f.id === 'graphic.text')).toBe(true);
  });

  it('creates blueprint records', () => {
    const bp = createArtifactBlueprint({
      artifactId: 'art-1',
      type: 'poster',
      objective: 'Grand opening',
    });
    expect(bp.blueprintId).toMatch(/^bp-/);
    expect(bp.status).toBe('draft');
  });
});
