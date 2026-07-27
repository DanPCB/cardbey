/**
 * Lazy loaders for TypeScript music modules (resolved via tsx at runtime).
 */

/** @type {typeof import('../music/musicSearchService.ts') | null} */
let musicSearchModule = null;

/** @type {typeof import('../music/openverseMusicClient.ts') | null} */
let openverseMusicModule = null;

export async function loadMusicSearchService() {
  if (!musicSearchModule) {
    musicSearchModule = await import('../music/musicSearchService.ts');
  }
  return musicSearchModule;
}

export async function loadOpenverseMusicClient() {
  if (!openverseMusicModule) {
    openverseMusicModule = await import('../music/openverseMusicClient.ts');
  }
  return openverseMusicModule;
}
