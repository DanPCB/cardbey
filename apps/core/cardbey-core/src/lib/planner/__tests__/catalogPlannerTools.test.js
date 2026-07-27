/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execute as validateStoreContext } from '../../toolExecutors/catalog/validate_store_context.js';
import { execute as prepareCatalog } from '../../toolExecutors/catalog/prepare_catalog.js';
import { validateDraftProductRows } from '../../toolExecutors/catalog/validate_products.js';
import {
  normalizePlannerToolName,
  normalizePlanSteps,
  markPreviewOnlySteps,
} from '../plannerToolNormalization.js';
import { isRuntimeTool } from '../../runtime/runtimeToolRegistry.js';

const mockBusinessFindUnique = vi.fn();
const mockDraftFindUnique = vi.fn();
const mockBusinessUpdate = vi.fn();
const mockProductCount = vi.fn();
const mockProductFindMany = vi.fn();
const mockBusinessEventCreate = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findUnique: mockBusinessFindUnique,
      update: mockBusinessUpdate,
    },
    draftStore: {
      findUnique: mockDraftFindUnique,
    },
    product: {
      count: mockProductCount,
      findMany: mockProductFindMany,
    },
    businessEvent: {
      create: mockBusinessEventCreate,
    },
  }),
}));

describe('planner tool normalization', () => {
  it('maps phantom template tools to registered tools', () => {
    expect(normalizePlannerToolName('validate_store_input')).toBe('validate_store_context');
    expect(normalizePlannerToolName('parse_catalog')).toBe('prepare_catalog');
    expect(normalizePlannerToolName('generate_graphic')).toBe('create_promotion_graphic');
  });

  it('normalizes add_product plan steps to executable tools', () => {
    const steps = normalizePlanSteps([
      { id: 'step_1', label: 'Validating store context...', type: 'action', tool: 'validate_store_context' },
      { id: 'step_2', label: 'Preparing product catalog...', type: 'action', tool: 'prepare_catalog' },
      { id: 'step_3', label: 'Uploading product data...', type: 'checkpoint', tool: 'replace_store_catalog' },
    ]);

    expect(steps[0].tool).toBe('validate_store_context');
    expect(steps[1].tool).toBe('prepare_catalog');
    expect(isRuntimeTool(steps[0].tool)).toBe(true);
    expect(isRuntimeTool(steps[1].tool)).toBe(true);
    expect(steps.every((step) => !step.preview_only)).toBe(true);
  });

  it('marks unknown action tools as preview_only', () => {
    const steps = markPreviewOnlySteps([
      { id: 'step_x', label: 'Mystery step', type: 'action', tool: 'totally_unknown_tool_xyz' },
    ]);

    expect(steps[0].preview_only).toBe(true);
    expect(steps[0].label).toContain('preview only');
  });
});

describe('catalog planner executors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBusinessEventCreate.mockResolvedValue({ id: 'evt_1', createdAt: new Date() });
    mockProductCount.mockResolvedValue(2);
    mockProductFindMany.mockResolvedValue([{ category: 'Food' }, { category: 'Drinks' }]);
  });

  it('validate_store_context fails without store context', async () => {
    const result = await validateStoreContext({}, {});
    expect(result.status).toBe('failed');
    expect(result.output.valid).toBe(false);
  });

  it('validate_store_context returns validated store info', async () => {
    mockBusinessFindUnique.mockResolvedValue({
      id: 'store_1',
      userId: 'user_1',
      name: 'Test Cafe',
      type: 'cafe',
      slug: 'test-cafe',
      isActive: true,
      catalogLabel: 'Menu',
    });

    const result = await validateStoreContext({ storeId: 'store_1' }, { userId: 'user_1' });

    expect(result.status).toBe('ok');
    expect(result.output.valid).toBe(true);
    expect(result.output.storeName).toBe('Test Cafe');
    expect(result.output.productCount).toBe(2);
    expect(mockBusinessEventCreate).toHaveBeenCalled();
  });

  it('prepare_catalog prepares published store catalog', async () => {
    mockBusinessFindUnique.mockResolvedValue({
      id: 'store_1',
      name: 'Test Cafe',
      catalogLabel: '',
    });
    mockBusinessUpdate.mockResolvedValue({});

    const result = await prepareCatalog({ storeId: 'store_1' }, { userId: 'user_1' });

    expect(result.status).toBe('ok');
    expect(result.output.success).toBe(true);
    expect(result.output.nextStep).toBe('replace_store_catalog');
    expect(mockBusinessUpdate).toHaveBeenCalled();
  });

  it('validateDraftProductRows flags missing names', () => {
    const result = validateDraftProductRows([{ name: 'Latte' }, { title: '' }]);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
