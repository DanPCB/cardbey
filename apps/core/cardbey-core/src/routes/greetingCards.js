/**
 * Greeting Cards REST API Routes
 * CRUD operations for MI Greeting Cards with sharing support
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { generateGreetingCardSlug } from '../utils/greetingCardSlug.js';
import { toPublicUserProfile } from '../utils/publicProfileMapper.js';
import { generateGreetingMessage } from '../services/greetingCardsAiService.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/greeting-cards
 * List all greeting cards for the authenticated user
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Check if GreetingCard model exists
    if (!prisma.greetingCard) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'GreetingCard model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    const cards = await prisma.greetingCard.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        type: true,
        templateKey: true,
        coverImageUrl: true,
        mediaUrl: true,
        shareSlug: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      ok: true,
      cards,
    });
  } catch (error) {
    console.error('[GreetingCards] List error:', error);
    next(error);
  }
});

/**
 * GET /api/greeting-cards/:id
 * Get a specific greeting card by ID (must belong to user)
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Check if GreetingCard model exists
    if (!prisma.greetingCard) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'GreetingCard model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    const card = await prisma.greetingCard.findUnique({
      where: { id },
    });

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: 'card_not_found',
        message: 'Greeting card not found',
      });
    }

    // Verify ownership
    if (card.ownerId !== userId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to access this card',
      });
    }

    res.json({
      ok: true,
      card,
    });
  } catch (error) {
    console.error('[GreetingCards] Get error:', error);
    next(error);
  }
});

/**
 * POST /api/greeting-cards
 * Create a new greeting card or update an existing draft
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      id,              // If provided, update existing; otherwise create new
      title,
      type,
      templateKey,
      message,
      coverImageUrl,
      mediaUrl,
      payloadJson,
    } = req.body;

    // Check if GreetingCard model exists
    if (!prisma.greetingCard) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'GreetingCard model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    // Validate required fields for new cards
    if (!id && (!type || !templateKey)) {
      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'type and templateKey are required for new cards',
      });
    }

    let card;

    if (id) {
      // Update existing card
      const existing = await prisma.greetingCard.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: 'card_not_found',
          message: 'Greeting card not found',
        });
      }

      // Verify ownership
      if (existing.ownerId !== userId) {
        return res.status(403).json({
          ok: false,
          error: 'access_denied',
          message: 'You do not have permission to update this card',
        });
      }

      // Build update data (only include provided fields)
      const updateData = {};
      if (title !== undefined) updateData.title = title || null;
      if (type !== undefined) updateData.type = type;
      if (templateKey !== undefined) updateData.templateKey = templateKey;
      if (message !== undefined) updateData.message = message || null;
      if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl || null;
      if (mediaUrl !== undefined) updateData.mediaUrl = mediaUrl || null;
      if (payloadJson !== undefined) updateData.payloadJson = payloadJson || null;

      card = await prisma.greetingCard.update({
        where: { id },
        data: updateData,
      });
    } else {
      // Create new card
      // Generate share slug
      const shareSlug = await generateGreetingCardSlug(prisma, { title, type });

      card = await prisma.greetingCard.create({
        data: {
          ownerId: userId,
          type,
          templateKey,
          title: title || null,
          message: message || null,
          coverImageUrl: coverImageUrl || null,
          mediaUrl: mediaUrl || null,
          payloadJson: payloadJson || null,
          shareSlug,
          isPublished: false,
          publishedAt: null,
        },
      });
    }

    res.json({
      ok: true,
      card,
    });
  } catch (error) {
    console.error('[GreetingCards] Create/Update error:', error);
    next(error);
  }
});

/**
 * POST /api/greeting-cards/:id/publish
 * Publish a greeting card and ensure it has a share slug
 */
router.post('/:id/publish', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const {
      title,
      message,
      coverImageUrl,
      mediaUrl,
    } = req.body;

    // Check if GreetingCard model exists
    if (!prisma.greetingCard) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'GreetingCard model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    // Find the card
    const card = await prisma.greetingCard.findUnique({
      where: { id },
    });

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: 'card_not_found',
        message: 'Greeting card not found',
      });
    }

    // Verify ownership
    if (card.ownerId !== userId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to publish this card',
      });
    }

    // Build update data
    const updateData = {
      isPublished: true,
    };

    // Update optional fields if provided
    if (title !== undefined) updateData.title = title || null;
    if (message !== undefined) updateData.message = message || null;
    if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl || null;
    if (mediaUrl !== undefined) updateData.mediaUrl = mediaUrl || null;

    // Ensure share slug exists
    if (!card.shareSlug || card.shareSlug.trim().length === 0) {
      updateData.shareSlug = await generateGreetingCardSlug(prisma, {
        title: title || card.title,
        type: card.type,
      });
    }

    // Set publishedAt if not already set
    if (!card.publishedAt) {
      updateData.publishedAt = new Date();
    }

    // Update the card
    const updatedCard = await prisma.greetingCard.update({
      where: { id },
      data: updateData,
    });

    res.json({
      ok: true,
      card: updatedCard,
    });
  } catch (error) {
    console.error('[GreetingCards] Publish error:', error);
    next(error);
  }
});

/**
 * GET /api/greeting-cards/public/:shareSlug
 * Public endpoint to view a shared greeting card (no auth required)
 */
router.get('/public/:shareSlug', async (req, res, next) => {
  try {
    const { shareSlug } = req.params;

    // Check if GreetingCard model exists
    if (!prisma.greetingCard) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'GreetingCard model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    // Find published card by share slug
    const card = await prisma.greetingCard.findUnique({
      where: { shareSlug },
      include: {
        owner: {
          include: {
            business: true,
          },
        },
      },
    });

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: 'card_not_found',
        message: 'Greeting card not found',
      });
    }

    // Only return published cards
    if (!card.isPublished) {
      return res.status(404).json({
        ok: false,
        error: 'card_not_found',
        message: 'Greeting card not found',
      });
    }

    // Build public profile URL if handle exists
    let publicProfileUrl = null;
    if (card.owner.handle) {
      // Use the same pattern as publicUsers route
      const baseUrl = process.env.PUBLIC_BASE_URL || (req ? `${req.protocol}://${req.get('host')}` : '');
      publicProfileUrl = `${baseUrl}/api/public/users/${card.owner.handle}`;
    }

    // Map owner to public profile (excludes sensitive data)
    const businesses = card.owner.business ? [card.owner.business] : [];
    const ownerProfile = toPublicUserProfile(card.owner, businesses);

    // Add public profile URL
    const owner = {
      ...ownerProfile,
      publicProfileUrl,
    };

    // Return card data (exclude ownerId and other sensitive fields)
    res.json({
      ok: true,
      card: {
        id: card.id,
        type: card.type,
        templateKey: card.templateKey,
        title: card.title,
        message: card.message,
        coverImageUrl: card.coverImageUrl,
        mediaUrl: card.mediaUrl,
        payloadJson: card.payloadJson,
        publishedAt: card.publishedAt,
      },
      owner,
    });
  } catch (error) {
    console.error('[GreetingCards] Public view error:', error);
    next(error);
  }
});

/**
 * POST /api/greeting-cards/ai-message
 * Generate a greeting message using AI
 */
router.post('/ai-message', requireAuth, async (req, res, next) => {
  try {
    const { type, templateKey, tone, language } = req.body || {};

    if (!type || !templateKey) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'type and templateKey are required',
      });
    }

    const message = await generateGreetingMessage({
      type,
      templateKey,
      tone,
      language,
    });

    return res.json({
      ok: true,
      message,
    });
  } catch (err) {
    console.error('[GreetingCards] AI message generation error:', err);
    next(err);
  }
});

export default router;

