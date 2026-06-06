/**
 * Skill orchestration layer — registry, executor, router.
 * Import this module once at server boot so skills self-register.
 */

import { dispatchTool } from '../toolDispatcher.js';
import { appendEvent } from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';
import { skillRegistry } from './SkillRegistry.js';
import { SkillExecutor } from './SkillExecutor.js';
import { SkillRouter } from './SkillRouter.js';

import './definitions/StoreLaunchSkill.js';
import './definitions/CampaignSkill.js';
import './definitions/SmartDisplayPublishSkill.js';
import './definitions/OfferOptimizationSkill.js';
import './definitions/LocalGrowthSkill.js';
import './definitions/BookingManagementSkill.js';
import './definitions/ProductCatalogSkill.js';
import './definitions/MenuSyncSkill.js';
import './definitions/AnalyticsReportSkill.js';
import './definitions/StoreHealthSkill.js';
import './definitions/ReviewManagementSkill.js';

const skillExecutor = new SkillExecutor({
  toolDispatcher: dispatchTool,
  blackboard: { appendEvent },
  prisma: getPrismaClient(),
});

export const skillRouter = new SkillRouter({
  skillRegistry,
  skillExecutor,
});

export { skillRegistry } from './SkillRegistry.js';
export { SkillExecutor } from './SkillExecutor.js';
export { SkillRouter } from './SkillRouter.js';
