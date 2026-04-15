/**
 * Journey Suggestions Engine
 * Rule-based context-aware recommendations (v1)
 * Later: Replace with ML model
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Build suggestions based on user context and mode
 * @param {Object} options - { user, mode, time }
 * @returns {Array} Ranked suggestions
 */
export async function buildSuggestions({ user, mode, time = new Date() }) {
  const hour = time.getHours();
  const dayOfWeek = time.getDay();
  const weekend = [0, 6].includes(dayOfWeek);
  const isGuest = !user;
  
  console.log(`[Suggestions] Building for mode="${mode}" user=${user?.id || 'guest'} weekend=${weekend}`);
  
  // Heuristic rules
  const heuristics = [];
  
  // HOME / MARKETING modes
  if (mode === 'home' || mode === 'marketing') {
    heuristics.push({
      templateSlug: 'weekend-promo',
      score: weekend ? 0.9 : 0.6,
      reason: weekend 
        ? '🎉 Perfect time for a weekend promo!' 
        : '📅 Plan your next promotional campaign'
    });
  }
  
  // STORE mode
  if (mode === 'store') {
    const hasStore = user?.hasBusiness || false;
    
    heuristics.push({
      templateSlug: 'launch-store-60',
      score: !hasStore ? 0.95 : 0.4,
      reason: !hasStore 
        ? '🚀 Launch your store in 60 minutes!' 
        : '📦 Add new products or update menu'
    });
  }
  
  // SCREENS mode
  if (mode === 'screens') {
    heuristics.push({
      templateSlug: 'connect-screens',
      score: 0.85,
      reason: '📺 Connect and manage your displays'
    });
    
    // If they have stores, suggest promo publishing
    if (user?.hasBusiness) {
      heuristics.push({
        templateSlug: 'weekend-promo',
        score: 0.75,
        reason: '🎨 Publish promos to your screens'
      });
    }
  }
  
  // PERFORMER mode - show actionable journeys
  if (mode === 'performer') {
    heuristics.push({
      templateSlug: 'weekend-promo',
      score: 0.8,
      reason: '📊 Boost your weekend sales'
    });
    
    heuristics.push({
      templateSlug: 'connect-screens',
      score: 0.7,
      reason: '📺 Expand your reach with screens'
    });
  }
  
  // EXPLORE mode - discovery focus
  if (mode === 'explore') {
    heuristics.push({
      templateSlug: 'launch-store-60',
      score: 0.75,
      reason: '🏪 Start selling online today'
    });
  }
  
  // Time-based boosts
  if (hour >= 9 && hour <= 11) {
    // Morning: planning time
    const planningBoost = heuristics.find(h => h.templateSlug === 'weekend-promo');
    if (planningBoost) {
      planningBoost.score *= 1.1;
      planningBoost.reason += ' (great time to plan!)';
    }
  }
  
  if (hour >= 17 && hour <= 19) {
    // Evening: execution time
    const actionBoost = heuristics.find(h => h.templateSlug === 'launch-store-60');
    if (actionBoost) {
      actionBoost.score *= 1.15;
      actionBoost.reason += ' (finish before dinner!)';
    }
  }
  
  // Fetch templates
  const templateSlugs = heuristics.map(h => h.templateSlug);
  const templates = await prisma.journeyTemplate.findMany({
    where: { slug: { in: templateSlugs } },
    include: {
      steps: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, title: true, kind: true, action: true }
      }
    }
  });
  
  // Map heuristics to templates
  const suggestions = heuristics
    .map(h => {
      const template = templates.find(t => t.slug === h.templateSlug);
      if (!template) return null;
      
      const estimatedMinutes = template.steps.length * 10; // Rough estimate
      
      return {
        templateId: template.id,
        slug: template.slug,
        title: template.title,
        summary: template.summary,
        category: template.category,
        tags: JSON.parse(template.tags || '[]'),
        stepCount: template.steps.length,
        estimatedMinutes,
        score: h.score,
        reason: h.reason,
        previewOnly: isGuest, // Guests can only preview
        steps: template.steps.map(s => ({
          title: s.title,
          kind: s.kind,
          action: s.action
        }))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Top 3
  
  console.log(`[Suggestions] Returning ${suggestions.length} suggestions`);
  
  return suggestions;
}

/**
 * Get suggestions for guest (preview-only)
 */
export async function getGuestSuggestions(mode) {
  return buildSuggestions({ user: null, mode });
}

/**
 * Get personalized suggestions for logged-in user
 */
export async function getUserSuggestions(user, mode) {
  return buildSuggestions({ user, mode });
}

/**
 * Save suggestion for later analysis (optional)
 */
export async function saveSuggestion(userId, suggestion) {
  try {
    await prisma.assistantSuggestion.create({
      data: {
        userId,
        mode: suggestion.mode || 'unknown',
        templateId: suggestion.templateId,
        title: suggestion.title,
        reason: suggestion.reason,
        score: suggestion.score
      }
    });
  } catch (error) {
    console.warn('[Suggestions] Failed to save:', error.message);
  }
}

