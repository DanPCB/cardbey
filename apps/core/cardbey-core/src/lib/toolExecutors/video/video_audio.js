/**
 * video_audio — thin wrapper over canonical post-production (TTS + mux + captions).
 * Kept as the VideoGenerationSkill step name for backward compatibility.
 */

import { execute as runPostProduction } from './video_post_production.js';

export async function execute(input = {}, context = {}) {
  return runPostProduction(input, context);
}

export default execute;
