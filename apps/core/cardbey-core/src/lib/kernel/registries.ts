/**
 * Cardbey AI Operating Kernel — Phase 0 registries.
 * Plugins register here; runtime and Performer do not branch on family.
 */

import type {
  CapabilityId,
  ExperienceSignal,
  KnowledgeSignal,
  MissionFamily,
  PerceptionFrame,
  RealityStreamWindow,
} from './types.js';

/** Perception plugin — interprets a stream window. */
export type PerceptionPlugin = {
  id: string;
  version: string;
  perceive: (args: {
    streamId: string;
    window: RealityStreamWindow;
  }) => Promise<PerceptionFrame> | PerceptionFrame;
};

/** Experience provider — platform-learned patterns (reasoning only). */
export type ExperienceProvider = {
  id: string;
  consult: (args: {
    missionFamilyHint?: MissionFamily | null;
    storeId?: string | null;
    topic: string;
  }) => Promise<ExperienceSignal[]> | ExperienceSignal[];
};

/** Knowledge provider — imported domain facts (reasoning only). */
export type KnowledgeProvider = {
  id: string;
  consult: (args: {
    topic: string;
    locale?: string;
  }) => Promise<KnowledgeSignal[]> | KnowledgeSignal[];
};

/** Capability handler binding inside a mission plugin. */
export type CapabilityBinding = {
  capability: CapabilityId;
  execute: (input: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;
};

/** Mission plugin — post-contract execution family. */
export type MissionPlugin = {
  family: MissionFamily;
  builderId: string;
  expectedAssetTypes: string[];
  uiCardFamily: string;
  publishPipelineId: string;
  allowedCapabilities: CapabilityId[];
  buildLivingGraph: (args: {
    contractId: string;
    userGoal: string;
    executionContext: Record<string, unknown>;
  }) => Promise<unknown> | unknown;
  capabilities: Partial<Record<CapabilityId, CapabilityBinding['execute']>>;
};

const perceptionPlugins = new Map<string, PerceptionPlugin>();
const experienceProviders = new Map<string, ExperienceProvider>();
const knowledgeProviders = new Map<string, KnowledgeProvider>();
const missionPlugins = new Map<MissionFamily, MissionPlugin>();

export function registerPerceptionPlugin(plugin: PerceptionPlugin): void {
  perceptionPlugins.set(plugin.id, plugin);
}

export function getPerceptionPlugin(id: string): PerceptionPlugin | undefined {
  return perceptionPlugins.get(id);
}

export function listPerceptionPlugins(): PerceptionPlugin[] {
  return [...perceptionPlugins.values()];
}

export function registerExperienceProvider(provider: ExperienceProvider): void {
  experienceProviders.set(provider.id, provider);
}

export function getExperienceProvider(id: string): ExperienceProvider | undefined {
  return experienceProviders.get(id);
}

export function listExperienceProviders(): ExperienceProvider[] {
  return [...experienceProviders.values()];
}

export function registerKnowledgeProvider(provider: KnowledgeProvider): void {
  knowledgeProviders.set(provider.id, provider);
}

export function getKnowledgeProvider(id: string): KnowledgeProvider | undefined {
  return knowledgeProviders.get(id);
}

export function listKnowledgeProviders(): KnowledgeProvider[] {
  return [...knowledgeProviders.values()];
}

export function registerMissionPlugin(plugin: MissionPlugin): void {
  missionPlugins.set(plugin.family, plugin);
}

export function getMissionPlugin(family: MissionFamily): MissionPlugin | undefined {
  return missionPlugins.get(family);
}

export function listMissionPlugins(): MissionPlugin[] {
  return [...missionPlugins.values()];
}

/** Phase 0 test helper — reset registries. */
export function __clearKernelRegistriesForTests(): void {
  perceptionPlugins.clear();
  experienceProviders.clear();
  knowledgeProviders.clear();
  missionPlugins.clear();
}
