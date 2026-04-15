/**
 * Journey Completion Handler
 * Triggers follow-up suggestions and records analytics
 */

import { PrismaClient } from '@prisma/client';
import { buildSuggestions } from './suggestions.js';

const prisma = new PrismaClient();

/**
 * Journey completion flow patterns
 * Maps completed journey → recommended next journeys
 */
const FOLLOW_UP_JOURNEYS = {
  'launch-store-60': ['weekend-promo', 'connect-screens'],
  'weekend-promo': ['connect-screens'],
  'connect-screens': ['weekend-promo']
};

/**
 * Handle journey completion
 * Called when all steps are DONE
 */
export async function handleJourneyCompletion(journeyInstance) {
  console.log(`[Completion] Processing completed journey: ${journeyInstance.id}`);
  
  try {
    const { userId, templateId } = journeyInstance;
    
    // Get template info
    const template = await prisma.journeyTemplate.findUnique({
      where: { id: templateId },
      select: { slug: true, title: true, category: true }
    });
    
    if (!template) return null;
    
    // Record completion metrics
    const completionTime = new Date() - new Date(journeyInstance.createdAt);
    const stepCount = await prisma.journeyStep.count({
      where: { instanceId: journeyInstance.id }
    });
    
    console.log(`[Completion] ✅ ${template.title} completed in ${Math.round(completionTime / 60000)} minutes`);
    
    // Generate follow-up suggestions
    const followUpSlugs = FOLLOW_UP_JOURNEYS[template.slug] || [];
    const suggestions = [];
    
    if (followUpSlugs.length > 0) {
      const followUpTemplates = await prisma.journeyTemplate.findMany({
        where: { slug: { in: followUpSlugs } },
        include: {
          steps: {
            select: { id: true, title: true }
          }
        }
      });
      
      for (const followUp of followUpTemplates) {
        const reason = getFollowUpReason(template.slug, followUp.slug);
        
        suggestions.push({
          templateId: followUp.id,
          slug: followUp.slug,
          title: followUp.title,
          summary: followUp.summary,
          stepCount: followUp.steps.length,
          estimatedMinutes: followUp.steps.length * 10,
          score: 0.9, // High score for intelligent follow-ups
          reason,
          source: 'completion_flow'
        });
        
        // Save to AssistantSuggestion for analytics
        await prisma.assistantSuggestion.create({
          data: {
            userId,
            mode: template.category || 'general',
            templateId: followUp.id,
            title: followUp.title,
            reason,
            score: 0.9
          }
        });
      }
    }
    
    console.log(`[Completion] Generated ${suggestions.length} follow-up suggestions`);
    
    return {
      suggestions,
      completionTime,
      stepCount,
      celebrationMessage: getCelebrationMessage(template.slug)
    };
    
  } catch (error) {
    console.error('[Completion] Error handling journey completion:', error);
    return null;
  }
}

/**
 * Get contextual reason for follow-up journey
 */
function getFollowUpReason(completedSlug, suggestedSlug) {
  const reasons = {
    'launch-store-60': {
      'weekend-promo': '🎉 Your store is live! Run a promo to attract customers',
      'connect-screens': '📺 Expand your reach with digital displays'
    },
    'weekend-promo': {
      'connect-screens': '📺 Amplify your promos with in-store screens'
    },
    'connect-screens': {
      'weekend-promo': '🎨 Create content for your new displays'
    }
  };
  
  return reasons[completedSlug]?.[suggestedSlug] || '✨ Recommended next step';
}

/**
 * Get celebration message for completed journey
 */
function getCelebrationMessage(slug) {
  const messages = {
    'launch-store-60': '🎊 Congratulations! Your store is now live and ready for customers!',
    'weekend-promo': '🎉 Campaign launched! Your promo is now running across all channels.',
    'connect-screens': '📺 Success! Your screens are connected and broadcasting.'
  };
  
  return messages[slug] || '✅ Journey completed successfully!';
}

/**
 * Trigger suggestions after journey completion
 * Returns formatted message for assistant
 */
export async function triggerCompletionSuggestions(journeyInstance, userId) {
  const completion = await handleJourneyCompletion(journeyInstance);
  
  if (!completion || completion.suggestions.length === 0) {
    return {
      message: completion?.celebrationMessage || 'Journey completed!',
      suggestions: []
    };
  }
  
  return {
    message: completion.celebrationMessage,
    suggestions: completion.suggestions.map(s => ({
      title: s.title,
      reason: s.reason,
      templateId: s.templateId,
      action: 'start'
    }))
  };
}














