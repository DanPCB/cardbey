/**
 * Tool Executor Registry - maps toolName to executor module.
 * Each executor implements execute(input, context?) and returns normalized result.
 * Missing executor => dispatcher returns controlled failure (no crash).
 */

import '../mcp/registerDefaultAdapters.js';
import * as analyze_store from './store/analyze_store.js';
import * as structured_store_build from './store/structured_store_build.js';
import * as generate_tags from './store/generate_tags.js';
import * as rewrite_descriptions from './store/rewrite_descriptions.js';
import * as improve_hero from './store/improve_hero.js';
import * as upload_store_asset from './store/upload_store_asset.js';
import * as replace_store_catalog from './store/replace_store_catalog.js';
import * as update_store_hero from './store/update_store_hero.js';
import * as setBusinessSocialLinks from './store/setBusinessSocialLinks.js';
import * as update_brand_kit from './store/update_brand_kit.js';
import * as search_hero_media from './media/search_hero_media.js';
import * as create_campaign_brief from './campaign/create_campaign_brief.js';
import * as generate_campaign_graphics from './campaign/generate_campaign_graphics.js';
import * as generate_campaign_copy from './campaign/generate_campaign_copy.js';
import * as qa_campaign_package from './campaign/qa_campaign_package.js';
import * as package_campaign_artifact from './campaign/package_campaign_artifact.js';
import * as select_display_content from './display/select_display_content.js';
import * as format_for_display from './display/format_for_display.js';
import * as push_to_display_device from './display/push_to_display_device.js';
import * as verify_display_output from './display/verify_display_output.js';
import * as analyze_offer_performance from './offer/analyze_offer_performance.js';
import * as suggest_offer_improvements from './offer/suggest_offer_improvements.js';
import * as apply_offer_optimization from './offer/apply_offer_optimization.js';
import * as track_offer_outcome from './offer/track_offer_outcome.js';
import * as audit_local_presence from './growth/audit_local_presence.js';
import * as generate_growth_plan from './growth/generate_growth_plan.js';
import * as monitor_growth_baseline from './growth/monitor_growth_baseline.js';
import * as check_booking_availability from './booking/check_booking_availability.js';
import * as create_booking_record from './booking/create_booking_record.js';
import * as confirm_booking_customer from './booking/confirm_booking_customer.js';
import * as schedule_booking_reminder from './booking/schedule_booking_reminder.js';
import * as handle_booking_outcome from './booking/handle_booking_outcome.js';
import * as get_booking_summary from './booking/get_booking_summary.js';
import * as manage_product_catalog from './catalog/manage_product_catalog.js';
import * as manage_menu_sync from './menu/manage_menu_sync.js';
import * as get_store_analytics from './get_store_analytics.js';
import * as generate_report_summary from './generate_report_summary.js';
import * as audit_store_completeness from './audit_store_completeness.js';
import * as generate_health_report from './generate_health_report.js';
import * as get_review_summary from './get_review_summary.js';
import * as draft_review_response from './draft_review_response.js';
import * as assign_promotion_slot from './promotion/assign_promotion_slot.js';
import * as activate_promotion from './promotion/activate_promotion.js';
import * as create_promotion from './promotion/create_promotion.js';
import * as create_offer_draft from './promotion/create_offer_draft.js';
import * as revise_offer_draft from './promotion/revise_offer_draft.js';
import * as launch_campaign from './promotion/launch_campaign.js';
import * as market_research from './store/market_research.js';
import * as mini_website_get_sections from './store/mini_website_get_sections.js';
import * as generate_section_patches from './store/generate_section_patches.js';
import * as mini_website_patch_sections from './store/mini_website_patch_sections.js';
import * as change_hero_headline from './store/change_hero_headline.js';
import * as propose_website_patch from '../../toolExecutors/store/propose_website_patch.js';
import * as consensus from './store/consensus.js';
import * as content_creator from './content/content_creator.js';
import * as crm from './crm/crm.js';
import * as signage_list_devices from './signage/signage_list_devices.js';
import * as signage_publish_to_devices from './signage/signage_publish_to_devices.js';
import * as device_send_input from './device/device_send_input.js';
import * as edit_artifact from './artifacts/editArtifact.js';
import * as publish_to_social from './social/publishToSocial.js';
import * as connect_social_account from './social/connectSocialAccount.js';
import * as mcp_context_products from './mcp/mcp_context_products.js';
import * as mcp_context_business from './mcp/mcp_context_business.js';
import * as mcp_context_store_assets from './mcp/mcp_context_store_assets.js';
import * as mcp_context_promotions from './mcp/mcp_context_promotions.js';
import * as mcp_context_missions from './mcp/mcp_context_missions.js';
import * as mcp_context_analytics from './mcp/mcp_context_analytics.js';
import * as mcp_google_calendar_create_event from './mcp/mcp_google_calendar_create_event.js';
import * as video_generate_multimodal from './videoGenerate.js';
import * as generate_slideshow from './generateSlideshow.js';
import * as generate_poster from './generatePoster.js';
import * as mutate_poster from './mutatePoster.js';
import * as audit_codebase from './maintenance/audit_codebase.js';
import * as propose_patch from './maintenance/propose_patch.js';
import * as apply_patch from './maintenance/apply_patch.js';
import * as query_control_tower from './maintenance/query_control_tower.js';
import * as detect_i18n_gaps from './maintenance/detect_i18n_gaps.js';
import * as apply_i18n_translations from './maintenance/apply_i18n_translations.js';
import { getPrismaClient } from '../prisma.js';
import { scanHardcodedStrings } from './i18n/scanHardcodedStrings.js'
import { checkI18nKey }         from './i18n/checkI18nKey.js'
import { addI18nKey }           from './i18n/addI18nKey.js'
import { wireI18nString }       from './i18n/wireI18nString.js'
import { generateI18nKey }      from './i18n/generateI18nKey.js'
import { translateString }      from './i18n/translateString.js'
import { runI18nTests }         from './i18n/runI18nTests.js'
import { reportI18nProgress }   from './i18n/reportI18nProgress.js'

/** Honest blocker for tools not implemented yet (no fake success payloads). */
function honestBlocker(toolName, message) {
  return {
    async execute() {
      return {
        status: 'blocked',
        reason: 'not_implemented',
        output: { toolName, message },
      };
    },
  };
}

/** Wrap i18n repair helpers (named fn exports) into standard executor shape. */
function wrapI18nExecutor(fn) {
  return {
    async execute(input = {}, context = {}) {
      try {
        const output = await fn(input, context);
        if (output?.ok === false) {
          return {
            status: 'failed',
            error: { message: typeof output?.error === 'string' ? output.error : 'i18n tool failed' },
            output,
          };
        }
        return { status: 'ok', output };
      } catch (err) {
        return {
          status: 'failed',
          error: { message: err?.message ?? String(err) },
        };
      }
    },
  };
}

/** @type {Record<string, { execute: (input: object, context?: object) => Promise<object> } | undefined>} */
export const executors = {
  analyze_store,
  structured_store_build,
  market_research,
  mini_website_get_sections,
  generate_section_patches,
  mini_website_patch_sections,
  change_hero_headline,
  propose_website_patch,
  consensus,
  content_creator,
  crm,
  generate_tags,
  rewrite_descriptions,
  improve_hero,
  upload_store_asset,
  replace_store_catalog,
  update_store_hero,
  setBusinessSocialLinks,
  update_brand_kit,
  search_hero_media,
  create_campaign_brief,
  generate_campaign_graphics,
  generate_campaign_copy,
  qa_campaign_package,
  package_campaign_artifact,
  select_display_content,
  format_for_display,
  push_to_display_device,
  verify_display_output,
  analyze_offer_performance,
  suggest_offer_improvements,
  apply_offer_optimization,
  track_offer_outcome,
  audit_local_presence,
  generate_growth_plan,
  monitor_growth_baseline,
  check_booking_availability,
  create_booking_record,
  confirm_booking_customer,
  schedule_booking_reminder,
  handle_booking_outcome,
  get_booking_summary,
  manage_product_catalog,
  manage_menu_sync,
  get_store_analytics,
  generate_report_summary,
  audit_store_completeness,
  generate_health_report,
  get_review_summary,
  draft_review_response,
  assign_promotion_slot,
  activate_promotion,
  create_promotion,
  create_offer_draft,
  revise_offer_draft,
  launch_campaign,
  edit_artifact,
  publish_to_social,
  connect_social_account,
  mcp_context_products,
  mcp_context_business,
  mcp_context_store_assets,
  mcp_context_promotions,
  mcp_context_missions,
  mcp_context_analytics,
  mcp_google_calendar_create_event,
  video_generate_multimodal,
  generate_slideshow,
  generate_poster,
  mutate_poster,
  audit_codebase,
  propose_patch,
  apply_patch,
  query_control_tower,
  detect_i18n_gaps,
  apply_i18n_translations,
  // i18n repair agent tools
  scanHardcodedStrings: wrapI18nExecutor(scanHardcodedStrings),
  checkI18nKey: wrapI18nExecutor(checkI18nKey),
  addI18nKey: wrapI18nExecutor(addI18nKey),
  wireI18nString: wrapI18nExecutor(wireI18nString),
  generateI18nKey: wrapI18nExecutor(generateI18nKey),
  translateString: wrapI18nExecutor(translateString),
  runI18nTests: wrapI18nExecutor(runI18nTests),
  reportI18nProgress: wrapI18nExecutor(reportI18nProgress),
  generate_promotion_asset: honestBlocker(
    'generate_promotion_asset',
    'Promotion asset generation is not implemented yet.',
  ),
  mission_pipeline_stub: {
    async execute(input = {}, context = {}) {
      const stepId = typeof context?.stepId === 'string' ? context.stepId.trim() : '';
      if (stepId) {
        try {
          const prisma = getPrismaClient();
          await prisma.missionPipelineStep.update({
            where: { id: stepId },
            data: { status: 'completed', outputsJson: { passed: true }, completedAt: new Date() },
          });
        } catch {
          // Best-effort: runner also persists completion; never block stub execution.
        }
      }
      return {
        status: 'ok',
        output: { ok: true, output: { passed: true } },
      };
    },
  },
  resolve_target_screens: honestBlocker(
    'resolve_target_screens',
    'Target screen resolution is not implemented yet.',
  ),
  prepare_screen_asset: honestBlocker(
    'prepare_screen_asset',
    'Screen asset preparation is not implemented yet.',
  ),
  assign_screen_slot: honestBlocker(
    'assign_screen_slot',
    'Screen slot assignment is not implemented yet.',
  ),
  activate_screen_content: honestBlocker(
    'activate_screen_content',
    'Screen content activation is not implemented yet.',
  ),
  generate_social_posts: honestBlocker(
    'generate_social_posts',
    'Social post generation is not implemented yet. Use content_creator or publish_to_social.',
  ),
  create_offer: honestBlocker('create_offer', 'Offer creation is not implemented yet. Use create_offer_draft.'),
  smart_visual: honestBlocker(
    'smart_visual',
    'Smart visual generation is coming soon. Use search_hero_media or edit_artifact meanwhile.',
  ),
  'signage.list-devices': signage_list_devices,
  'signage.publish-to-devices': signage_publish_to_devices,
  'device.sendInput': device_send_input,
};

/**
 * @param {string} toolName
 * @returns {{ execute: (input: object, context?: object) => Promise<object> } | undefined}
 */
export function getExecutor(toolName) {
  if (!toolName || typeof toolName !== 'string') return undefined;
  const key = toolName.trim();
  return executors[key];
}
