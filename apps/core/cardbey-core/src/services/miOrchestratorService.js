/**
 * MI Orchestrator Service - JavaScript wrapper
 * Dynamically loads TypeScript implementation so plain Node can boot without .ts at eval.
 */

function tsModuleUnavailable(name) {
  const e = new Error(`${name} unavailable in plain Node runtime. Run server with tsx or add build step to compile TS.`);
  e.status = 501;
  e.code = 'TS_MODULE_UNAVAILABLE';
  return e;
}

let _miOrchestratorMod;
async function loadMiOrchestratorService() {
  try {
    return (_miOrchestratorMod ??= await import('./miOrchestratorService.ts'));
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

export async function getSignagePlaylistSuggestions(params) {
  const mod = await loadMiOrchestratorService();
  if (!mod) throw tsModuleUnavailable('miOrchestratorService');
  const fn = mod.getSignagePlaylistSuggestions ?? mod.default?.getSignagePlaylistSuggestions;
  if (typeof fn !== 'function') throw tsModuleUnavailable('miOrchestratorService');
  return fn(params);
}export async function getTemplateSuggestionsForContext(params) {
  const mod = await loadMiOrchestratorService();
  if (!mod) throw tsModuleUnavailable('miOrchestratorService');
  const fn = mod.getTemplateSuggestionsForContext ?? mod.default?.getTemplateSuggestionsForContext;
  if (typeof fn !== 'function') throw tsModuleUnavailable('miOrchestratorService');
  return fn(params);
}export async function instantiateCreativeTemplateForContext(params) {
  const mod = await loadMiOrchestratorService();
  if (!mod) throw tsModuleUnavailable('miOrchestratorService');
  const fn = mod.instantiateCreativeTemplateForContext ?? mod.default?.instantiateCreativeTemplateForContext;
  if (typeof fn !== 'function') throw tsModuleUnavailable('miOrchestratorService');
  return fn(params);
}