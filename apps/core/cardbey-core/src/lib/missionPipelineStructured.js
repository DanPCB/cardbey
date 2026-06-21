/**
 * Structured mission steps (Phase 3): checkpoints + conditionals for store / campaign pipelines.
 * Consumed only by missionPipelineService when materializing MissionPipelineStep rows.
 * Execution stays in runNextMissionPipelineStep + runMissionUntilBlocked (single runner).
 */

import { normalizeLocale } from './localePrompt.js';

/**
 * Checkpoint option: `value` is stable English for pipeline conditionals; `displayLabel` is UI-only.
 * @param {string} value
 * @param {{ en: string, vi: string }} displayLabel
 */
function checkpointOption(value, displayLabel) {
  return { value, displayLabel };
}

/** Stable English values — conditionals match these literals (logoChoice === "Upload now"). */
const LOGO_CHECKPOINT_OPTION_ITEMS = [
  checkpointOption('Upload now', { en: 'Upload now', vi: 'Tải lên ngay' }),
  checkpointOption('Skip', { en: 'Skip', vi: 'Bỏ qua' }),
  checkpointOption('Choose from library', { en: 'Choose from library', vi: 'Chọn từ thư viện' }),
];

const FEATURED_PRODUCT_OPTION_ITEMS = [
  checkpointOption('Top seller', { en: 'Top seller', vi: 'Bán chạy nhất' }),
  checkpointOption('New arrival', { en: 'New arrival', vi: 'Hàng mới' }),
  checkpointOption('Custom — pick in catalog', {
    en: 'Custom — pick in catalog',
    vi: 'Tùy chọn — chọn trong danh mục',
  }),
];

const LAUNCH_DECISION_OPTION_ITEMS = [
  checkpointOption('Launch now', { en: 'Launch now', vi: 'Ra mắt ngay' }),
  checkpointOption('Edit first', { en: 'Edit first', vi: 'Chỉnh sửa trước' }),
  checkpointOption('Cancel', { en: 'Cancel', vi: 'Hủy' }),
];

/** @param {Array<{ value: string, displayLabel: { en: string, vi: string } }>} items */
export function checkpointOptionValues(items) {
  return items.map((o) => o.value);
}

/**
 * Resolve display strings for the active locale (values unchanged for submission).
 * @param {Array<{ value: string, displayLabel: { en: string, vi: string } }>} items
 * @param {unknown} locale
 */
export function resolveCheckpointOptionsForLocale(items, locale) {
  const loc = normalizeLocale(locale);
  return items.map((o) => ({
    value: o.value,
    label: o.displayLabel?.[loc] ?? o.displayLabel?.en ?? o.value,
  }));
}

const CHECKPOINT_COPY = {
  store: {
    logo: {
      en: {
        prompt: 'Would you like to upload a logo for your store?',
      },
      vi: {
        prompt: 'Bạn có muốn tải lên logo cho cửa hàng không?',
      },
    },
  },
  launch_campaign: {
    featuredProduct: {
      en: { prompt: 'Which product would you like to feature?' },
      vi: { prompt: 'Bạn muốn giới thiệu sản phẩm nào?' },
    },
    launchReview: {
      en: { prompt: 'Review your campaign creative. Ready to launch?' },
      vi: { prompt: 'Xem lại nội dung chiến dịch. Sẵn sàng ra mắt chưa?' },
    },
  },
};

const STEP_LABEL_COPY = {
  store: {
    logo: { en: 'Logo', vi: 'Logo' },
    logoPath: { en: 'Logo path', vi: 'Nhánh logo' },
    generateStoreDraft: { en: 'Generate store draft', vi: 'Tạo bản nháp cửa hàng' },
    reviewStore: { en: 'Review store', vi: 'Xem lại cửa hàng' },
  },
  launch_campaign: {
    research: { en: 'Research', vi: 'Nghiên cứu' },
    featuredProduct: { en: 'Featured product', vi: 'Sản phẩm nổi bật' },
    createCreative: { en: 'Create creative', vi: 'Tạo nội dung sáng tạo' },
    launchReview: { en: 'Launch review', vi: 'Xem lại trước khi ra mắt' },
    launchOrSave: { en: 'Launch or save', vi: 'Ra mắt hoặc lưu' },
  },
};

function pickCheckpointCopy(group, key, locale) {
  const loc = normalizeLocale(locale);
  const bucket = group?.[key];
  if (!bucket || typeof bucket !== 'object') return null;
  return bucket[loc] ?? bucket.en ?? null;
}

function pickStepLabel(group, key, locale) {
  const loc = normalizeLocale(locale);
  const bucket = group?.[key];
  if (!bucket || typeof bucket !== 'object') return null;
  return bucket[loc] ?? bucket.en ?? null;
}

function buildCheckpointConfig({ prompt, optionItems, outputKey, dynamicOptions }) {
  return {
    prompt,
    options: checkpointOptionValues(optionItems),
    optionItems,
    outputKey,
    ...(dynamicOptions ? { dynamicOptions } : {}),
  };
}

/**
 * @param {string} missionType
 * @param {string} [locale]
 * @returns {Array<{
 *   orderIndex: number,
 *   toolName: string,
 *   label: string,
 *   stepKind: 'action' | 'checkpoint' | 'conditional',
 *   configJson?: object,
 *   inputJson?: object,
 * }>}
 */
export function getStructuredMissionSteps(missionType, locale = 'en') {
  const t = typeof missionType === 'string' ? missionType.trim().toLowerCase() : '';
  if (t === 'store') {
    const logoCopy = pickCheckpointCopy(CHECKPOINT_COPY.store, 'logo', locale);
    const labels = STEP_LABEL_COPY.store;
    return [
      {
        orderIndex: 0,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: pickStepLabel(labels, 'logo', locale) ?? labels.logo.en,
        configJson: buildCheckpointConfig({
          prompt: logoCopy?.prompt ?? CHECKPOINT_COPY.store.logo.en.prompt,
          optionItems: LOGO_CHECKPOINT_OPTION_ITEMS,
          outputKey: 'logoChoice',
        }),
      },
      {
        orderIndex: 1,
        stepKind: 'conditional',
        toolName: 'mission.conditional',
        label: pickStepLabel(labels, 'logoPath', locale) ?? labels.logoPath.en,
        configJson: {
          condition: 'logoChoice === "Upload now"',
          ifTrueTool: 'mission_conditional_branch',
          ifFalseTool: 'mission_conditional_branch',
          ifTrueInput: { branch: 'upload', label: 'await_logo_upload' },
          ifFalseInput: { branch: 'default', label: 'assign_default_logo' },
        },
      },
      {
        orderIndex: 2,
        stepKind: 'action',
        toolName: 'structured_store_build',
        label: pickStepLabel(labels, 'generateStoreDraft', locale) ?? labels.generateStoreDraft.en,
      },
      {
        orderIndex: 3,
        stepKind: 'action',
        toolName: 'analyze_store',
        label: pickStepLabel(labels, 'reviewStore', locale) ?? labels.reviewStore.en,
      },
    ];
  }
  if (t === 'launch_campaign') {
    const featuredCopy = pickCheckpointCopy(
      CHECKPOINT_COPY.launch_campaign,
      'featuredProduct',
      locale,
    );
    const launchCopy = pickCheckpointCopy(CHECKPOINT_COPY.launch_campaign, 'launchReview', locale);
    const labels = STEP_LABEL_COPY.launch_campaign;
    return [
      {
        orderIndex: 0,
        stepKind: 'action',
        toolName: 'market_research',
        label: pickStepLabel(labels, 'research', locale) ?? labels.research.en,
      },
      {
        orderIndex: 1,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: pickStepLabel(labels, 'featuredProduct', locale) ?? labels.featuredProduct.en,
        configJson: buildCheckpointConfig({
          prompt:
            featuredCopy?.prompt ?? CHECKPOINT_COPY.launch_campaign.featuredProduct.en.prompt,
          optionItems: FEATURED_PRODUCT_OPTION_ITEMS,
          outputKey: 'featuredProductId',
          dynamicOptions: 'store.getProducts',
        }),
      },
      {
        orderIndex: 2,
        stepKind: 'action',
        toolName: 'create_promotion',
        label: pickStepLabel(labels, 'createCreative', locale) ?? labels.createCreative.en,
      },
      {
        orderIndex: 3,
        stepKind: 'checkpoint',
        toolName: 'mission.checkpoint',
        label: pickStepLabel(labels, 'launchReview', locale) ?? labels.launchReview.en,
        configJson: buildCheckpointConfig({
          prompt: launchCopy?.prompt ?? CHECKPOINT_COPY.launch_campaign.launchReview.en.prompt,
          optionItems: LAUNCH_DECISION_OPTION_ITEMS,
          outputKey: 'launchDecision',
        }),
      },
      {
        orderIndex: 4,
        stepKind: 'conditional',
        toolName: 'mission.conditional',
        label: pickStepLabel(labels, 'launchOrSave', locale) ?? labels.launchOrSave.en,
        configJson: {
          condition: 'launchDecision === "Launch now"',
          ifTrueTool: 'mission_conditional_branch',
          ifFalseTool: 'mission_conditional_branch',
          ifTrueInput: { branch: 'launch', label: 'campaign_publish' },
          ifFalseInput: { branch: 'draft', label: 'campaign_save_draft' },
        },
      },
    ];
  }
  return [];
}
