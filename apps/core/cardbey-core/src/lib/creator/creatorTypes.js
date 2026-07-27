/**
 * Creator Foundation Phase 1 — constants and types.
 */

export const CREATOR_CONTENT_TYPES = Object.freeze({
  VIDEO: 'VIDEO',
  ARTICLE: 'ARTICLE',
  LIVESTREAM: 'LIVESTREAM',
});

export const CREATOR_CONTENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  OWNER_REVIEW: 'owner_review',
  PUBLISHED: 'published',
  DELETED: 'deleted',
  FAILED: 'failed',
});

export const QUALIFICATION_MINUTES = 300;
/** Canonical qualification threshold — 300 minutes in seconds */
export const QUALIFICATION_SECONDS = QUALIFICATION_MINUTES * 60;

/** Future extension hooks — not implemented in Phase 1 */
export const CREATOR_FUTURE_HOOKS = Object.freeze({
  wallet: 'creator_wallet',
  paymentProgram: 'creator_300_minute_payment',
  aiTranslation: 'creator_ai_translation',
  aiSubtitles: 'creator_ai_subtitles',
  sponsorships: 'creator_sponsorships',
  businessCollaborations: 'creator_business_collaborations',
  marketplace: 'creator_marketplace',
  knowledgeExtraction: 'creator_knowledge_extraction',
});

/**
 * @param {object} creator
 * @returns {object}
 */
export function toPublicCreator(creator) {
  if (!creator) return null;
  return {
    creatorId: creator.id,
    userId: creator.userId,
    displayName: creator.displayName ?? null,
    username: creator.username,
    avatar: creator.avatar ?? null,
    banner: creator.banner ?? null,
    bio: creator.bio ?? null,
    languages: Array.isArray(creator.languages) ? creator.languages : [],
    country: creator.country ?? null,
    categories: Array.isArray(creator.categories) ? creator.categories : [],
    verifiedStatus: creator.verifiedStatus ?? 'unverified',
    joinedAt: creator.joinedAt,
    totalPublishedMinutes: creator.totalPublishedMinutes ?? 0,
    totalVideos: creator.totalVideos ?? 0,
    totalArticles: creator.totalArticles ?? 0,
    totalViews: creator.totalViews ?? 0,
    followers: creator.followers ?? 0,
    following: creator.following ?? 0,
    creatorLevel: creator.creatorLevel ?? 1,
    creatorStatus: creator.creatorStatus ?? 'active',
    qualificationProgress: creator.qualificationProgress ?? 0,
    isQualified: Boolean(creator.isQualified),
  };
}

/**
 * @param {object} content
 * @returns {object}
 */
export function toPublicCreatorContent(content) {
  if (!content) return null;
  return {
    contentId: content.id,
    creatorId: content.creatorId,
    type: content.type,
    title: content.title,
    description: content.description ?? null,
    language: content.language ?? null,
    durationSeconds: content.durationSeconds ?? null,
    publishedAt: content.publishedAt ?? null,
    visibility: content.visibility ?? 'public',
    thumbnail: content.thumbnail ?? null,
    mediaUrl: content.mediaUrl ?? null,
    status: content.status,
    views: content.views ?? 0,
    likes: content.likes ?? 0,
    shares: content.shares ?? 0,
    bookmarks: content.bookmarks ?? 0,
    runtimeMissionId: content.runtimeMissionId ?? null,
    sourceType: content.sourceType ?? null,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}
