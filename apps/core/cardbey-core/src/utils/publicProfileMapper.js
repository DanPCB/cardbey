/**
 * Public Profile Mapper
 * Maps User + Business data to safe public DTO
 * Never exposes sensitive data (email, tokens, etc.)
 */

/**
 * Map User + Business to PublicUserProfile
 * @param {Object} user - User object from Prisma
 * @param {Array} businesses - Array of Business objects (stores)
 * @returns {Object} PublicUserProfile
 */
export function toPublicUserProfile(user, businesses = []) {
  // Map businesses to public store summaries
  const stores = (businesses || []).map(business => ({
    id: business.id,
    name: business.name,
    slug: business.slug || null,
    // Note: creationMethod is not stored in Business model, so we omit it
    // Add any other safe public fields here
    // e.g., logo, region (if public)
  }));

  return {
    handle: user.handle || null,
    fullName: user.fullName || user.displayName || null,
    avatarUrl: user.avatarUrl || null,
    accountType: user.accountType || 'personal',
    tagline: user.tagline || null,
    stores: stores,
  };
}

