/**
 * Validate StorefrontRenderViewModel before preview attach.
 */

import { isStorefrontAction } from '../contracts/storefrontAction.js';

/**
 * @param {object} viewModel
 * @param {{ catalogItems?: unknown[], businessData?: Record<string, unknown> }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateRenderViewModel(viewModel, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  if (!viewModel || typeof viewModel !== 'object') {
    return { ok: false, errors: ['view_model_missing'] };
  }
  if (viewModel.authoritative !== false) {
    errors.push('authoritative_must_be_false');
  }
  if (!Number.isFinite(viewModel.adapterVersion)) {
    errors.push('adapter_version_missing');
  }
  if (viewModel.source !== 'design_library_projection' && viewModel.source !== 'legacy') {
    errors.push('invalid_source');
  }

  const ids = new Set();
  for (const section of viewModel.sections ?? []) {
    if (!section?.id) {
      errors.push('section_missing_id');
      continue;
    }
    if (ids.has(section.id)) errors.push(`duplicate_section_id:${section.id}`);
    ids.add(section.id);

    if (['services', 'products', 'menu', 'featured_items'].includes(section.semanticRole)) {
      for (const item of section.items ?? []) {
        if (['policy', 'career', 'testimonial', 'navigation'].includes(item.contentRole)) {
          errors.push(`forbidden_commerce_item:${section.semanticRole}:${item.contentRole}`);
        }
        if (item.purchaseEnabled && (item.price == null || item.price === '')) {
          errors.push(`unpriced_purchasable:${item.id}`);
        }
      }
    }

    for (const action of section.actions ?? []) {
      if (!isStorefrontAction(action.action)) {
        errors.push(`unsupported_action:${action.action}`);
      }
      // request_quote must never be labeled/mapped as Book
      if (action.action === 'request_quote' && /book/i.test(action.label ?? '')) {
        errors.push('request_quote_mapped_to_book_label');
      }
    }
  }

  if (viewModel.primaryAction) {
    if (!isStorefrontAction(viewModel.primaryAction.action)) {
      errors.push(`primary_action_invalid:${viewModel.primaryAction.action}`);
    }
    if (
      viewModel.primaryAction.action === 'request_quote' &&
      /book/i.test(viewModel.primaryAction.label ?? '')
    ) {
      errors.push('primary_request_quote_labeled_book');
    }
  }

  void opts;
  return { ok: errors.length === 0, errors };
}
