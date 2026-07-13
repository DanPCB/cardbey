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
import * as search_music_for_business from './music/search_music_for_business.js';
import * as select_music_track from './music/select_music_track.js';
import * as create_campaign_brief from './campaign/create_campaign_brief.js';
import * as create_campaign from './campaign/create_campaign.js';
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
import * as validate_store_context from './catalog/validate_store_context.js';
import * as prepare_catalog from './catalog/prepare_catalog.js';
import * as finalize_catalog from './catalog/finalize_catalog.js';
import * as validate_products from './catalog/validate_products.js';
import * as select_products from './catalog/select_products.js';
import * as specify_purpose from './catalog/specify_purpose.js';
import * as planner_checkpoint_delegate from './mission/planner_checkpoint_delegate.js';
import * as manage_menu_sync from './menu/manage_menu_sync.js';
import * as get_store_analytics from './get_store_analytics.js';
import * as generate_report_summary from './generate_report_summary.js';
import * as audit_store_completeness from './audit_store_completeness.js';
import * as generate_health_report from './generate_health_report.js';
import * as get_review_summary from './get_review_summary.js';
import * as draft_review_response from './draft_review_response.js';
import * as segment_loyal_customers from './loyalty/segment_loyal_customers.js';
import * as define_loyalty_tiers from './loyalty/define_loyalty_tiers.js';
import * as create_loyalty_offer from './loyalty/create_loyalty_offer.js';
import * as schedule_loyalty_campaign from './loyalty/schedule_loyalty_campaign.js';
import * as setup_loyalty_program from './loyalty/setup_loyalty_program.js';
import { LOYALTY_STAGE_EXECUTORS } from './loyalty/loyaltyStageHandlers.js';
import * as fetch_store_content from './content/fetch_store_content.js';
import * as rewrite_content_copy from './content/rewrite_content_copy.js';
import * as generate_seo_tags from './content/generate_seo_tags.js';
import * as audit_hero_media from './hero/audit_hero_media.js';
import * as suggest_hero_media from './hero/suggest_hero_media.js';
import * as identify_feature_target from './homepage/identify_feature_target.js';
import * as apply_homepage_feature from './homepage/apply_homepage_feature.js';
import * as assign_promotion_slot from './promotion/assign_promotion_slot.js';
import * as activate_promotion from './promotion/activate_promotion.js';
import * as create_promotion from './promotion/create_promotion.js';
import * as create_offer from './promotion/create_offer.js';
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
import * as create_creator_profile from './creator/create_creator_profile.js';
import * as create_creator_content_draft from './creator/create_creator_content_draft.js';
import * as publish_creator_content from './creator/publish_creator_content.js';
import * as update_creator_content from './creator/update_creator_content.js';
import * as delete_creator_content from './creator/delete_creator_content.js';
import * as submit_creator_content_for_review from './creator/submit_creator_content_for_review.js';
import * as return_creator_content_to_draft from './creator/return_creator_content_to_draft.js';
import * as classify_creator_content from './creator/classify_creator_content.js';
import * as approve_creator_content from './creator/approve_creator_content.js';
import * as request_creator_content_changes from './creator/request_creator_content_changes.js';
import * as reject_creator_content from './creator/reject_creator_content.js';
import * as escalate_creator_content from './creator/escalate_creator_content.js';
import * as schedule_creator_content from './creator/schedule_creator_content.js';
import * as calculate_creator_progress from './creator/calculate_creator_progress.js';
import * as generate_social_posts from './content/generate_social_posts.js';
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
import { EXECUTION_STATES } from '../telemetry/executionStates.js';
import { scanHardcodedStrings } from './i18n/scanHardcodedStrings.js'
import { checkI18nKey }         from './i18n/checkI18nKey.js'
import { addI18nKey }           from './i18n/addI18nKey.js'
import { wireI18nString }       from './i18n/wireI18nString.js'
import { generateI18nKey }      from './i18n/generateI18nKey.js'
import { translateString }      from './i18n/translateString.js'
import { runI18nTests }         from './i18n/runI18nTests.js'
import { reportI18nProgress }   from './i18n/reportI18nProgress.js'
import * as analyze_video_brief from './video/analyze_video_brief.js'; // DANH: skill-round5-video
import * as generate_video_script from './video/generate_video_script.js'; // DANH: skill-round5-video
import * as queue_video_generation from './video/queue_video_generation.js'; // DANH: skill-round5-video
import * as video_plan from './video/video_plan.js';
import * as video_execute from './video/video_execute.js';
import * as video_audio from './video/video_audio.js';
import * as create_video from './video/videoRouter.js';
import * as generate_video from './video/videoRouter.js';
import * as check_scan_capability from './scan/check_scan_capability.js'; // DANH: skill-round5-cardscan
import * as extract_card_data from './scan/extract_card_data.js'; // DANH: skill-round5-cardscan
import * as create_product_from_card from './scan/create_product_from_card.js'; // DANH: skill-round5-cardscan
import * as scan_card from './scan/scan_card.js';
import * as code_fix from './code/code_fix.js';
import * as check_cnet_config from './cnet/check_cnet_config.js'; // DANH: skill-round5-cnet
import * as prepare_cnet_payload from './cnet/prepare_cnet_payload.js'; // DANH: skill-round5-cnet
import * as deploy_to_cnet from './cnet/deploy_to_cnet.js'; // DANH: skill-round5-cnet
import * as extract_document_data from './document/extract_document_data.js';
import * as ingest_asset_for_intent_detection from './intake/ingest_asset_for_intent_detection.js'; // DANH: skill-round6-document
import * as create_products_from_document from './document/create_products_from_document.js'; // DANH: skill-round6-document
import * as create_promotions_from_document from './document/create_promotions_from_document.js'; // DANH: skill-round6-document
import * as suggest_campaign_plan from './document/suggest_campaign_plan.js'; // DANH: skill-round6-document
import * as generate_execution_summary from './document/generate_execution_summary.js'; // DANH: skill-round6-document
import * as generate_living_document from './document/generate_living_document.js'; // DANH: living-document-platform
import * as activate_campaigns from './campaign/activate_campaigns.js'; // DANH: living-document-platform
import * as resolve_vision_location from './vision/resolve_vision_location.js';
import * as classify_vision_event from './vision/classify_vision_event.js';
import * as route_vision_event from './vision/route_vision_event.js';
import * as mission_conditional_branch from './mission/mission_conditional_branch.js';
import * as create_ghost_store from './ghost/create_ghost_store.js';
import * as enrich_ghost_store from './ghost/enrich_ghost_store.js';
import * as create_store from './store/create_store.js';
import * as create_mini_website from './website/create_mini_website.js';
import * as smart_visual from './design/smart_visual.js';
import * as create_order from './business/create_order.js';
import * as checkout_order from './business/checkout_order.js';
import * as cancel_order from './business/cancel_order.js';
import * as receive_inventory from './business/receive_inventory.js';
import * as adjust_inventory from './business/adjust_inventory.js';
import * as record_payment from './business/record_payment.js';
import * as print_receipt from './business/print_receipt.js';
import * as phase2Business from './business/phase2Stubs.js';

/** Honest blocker for tools not implemented yet (no fake success payloads). */
function honestBlocker(toolName, message) {
  return {
    async execute() {
      return {
        status: 'blocked',
        reason: 'not_implemented',
        output: {
          toolName,
          message,
          executionState: EXECUTION_STATES.BLOCKED,
          blocked: true,
        },
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
  analyze_competitors: market_research,
  trend_analysis: market_research,
  mini_website_get_sections,
  generate_section_patches,
  mini_website_patch_sections,
  change_hero_headline,
  propose_website_patch,
  consensus,
  content_creator,
  create_creator_profile,
  create_creator_content_draft,
  publish_creator_content,
  update_creator_content,
  delete_creator_content,
  submit_creator_content_for_review,
  return_creator_content_to_draft,
  classify_creator_content,
  approve_creator_content,
  request_creator_content_changes,
  reject_creator_content,
  escalate_creator_content,
  schedule_creator_content,
  calculate_creator_progress,
  generate_social_posts,
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
  search_music_for_business,
  select_music_track,
  create_campaign_brief,
  create_campaign,
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
  validate_store_context,
  prepare_catalog,
  finalize_catalog,
  validate_products,
  select_products,
  specify_purpose,
  review_graphic: planner_checkpoint_delegate,
  review_campaign: planner_checkpoint_delegate,
  capture_requirements: planner_checkpoint_delegate,
  manage_menu_sync,
  get_store_analytics,
  generate_report_summary,
  audit_store_completeness,
  generate_health_report,
  get_review_summary,
  draft_review_response,
  segment_loyal_customers,
  define_loyalty_tiers,
  create_loyalty_offer,
  schedule_loyalty_campaign,
  setup_loyalty_program,
  ...LOYALTY_STAGE_EXECUTORS,
  fetch_store_content,
  rewrite_content_copy,
  generate_seo_tags,
  audit_hero_media,
  suggest_hero_media,
  identify_feature_target,
  apply_homepage_feature,
  assign_promotion_slot,
  activate_promotion,
  create_promotion,
  create_offer,
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
  analyze_video_brief, // DANH: skill-round5-video
  generate_video_script, // DANH: skill-round5-video
  queue_video_generation, // DANH: skill-round5-video
  video_plan,
  video_execute,
  video_audio,
  create_video,
  generate_video,
  check_scan_capability, // DANH: skill-round5-cardscan
  extract_card_data, // DANH: skill-round5-cardscan
  create_product_from_card, // DANH: skill-round5-cardscan
  scan_card,
  code_fix,
  check_cnet_config, // DANH: skill-round5-cnet
  prepare_cnet_payload, // DANH: skill-round5-cnet
  deploy_to_cnet, // DANH: skill-round5-cnet
  extract_document_data, // DANH: skill-round6-document
  ingest_asset_for_intent_detection,
  create_products_from_document, // DANH: skill-round6-document
  create_promotions_from_document, // DANH: skill-round6-document
  suggest_campaign_plan, // DANH: skill-round6-document
  generate_execution_summary, // DANH: skill-round6-document
  generate_living_document, // DANH: living-document-platform
  activate_campaigns, // DANH: living-document-platform
  resolve_vision_location,
  classify_vision_event,
  route_vision_event,
  create_ghost_store,
  enrich_ghost_store,
  create_store,
  create_mini_website,
  smart_visual,
  create_promotion_graphic: smart_visual,
  generate_promo_image: smart_visual,
  generate_promotion_asset: smart_visual,
  create_order,
  checkout_order,
  cancel_order,
  receive_inventory,
  adjust_inventory,
  record_payment,
  print_receipt,
  update_order: phase2Business.update_order,
  transfer_inventory: phase2Business.transfer_inventory,
  refund_order: phase2Business.refund_order,
  close_shift: phase2Business.close_shift,
  open_shift: phase2Business.open_shift,
  create_supplier: phase2Business.create_supplier,
  create_purchase_order: phase2Business.create_purchase_order,
  receive_purchase_order: phase2Business.receive_purchase_order,
  apply_discount: phase2Business.apply_discount,
  apply_tax: phase2Business.apply_tax,
  assign_table: phase2Business.assign_table,
  move_table: phase2Business.move_table,
  merge_order: phase2Business.merge_order,
  split_bill: phase2Business.split_bill,
  mission_conditional_branch,
  mission_pipeline_stub: mission_conditional_branch,
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

/** @returns {string[]} Registered executor tool names (includes aliases). */
export function listRegisteredExecutorTools() {
  return Object.keys(executors);
}
