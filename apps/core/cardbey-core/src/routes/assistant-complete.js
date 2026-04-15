/**
 * Complete Assistant Routes
 * Chat, Actions, Summary, Guest tokens
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { requireUserOrGuest, canPerformAction } from '../middleware/guestAuth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * Extract page context from request header
 */
function extractContext(req) {
  try {
    const context = req.headers['x-cardbey-context'];
    if (!context) return null;
    return JSON.parse(context);
  } catch (err) {
    return null;
  }
}

/**
 * POST /api/assistant/guest
 * Generate guest token (24h expiry, limited features)
 */
router.post('/guest', (req, res) => {
  const guestId = `guest_${crypto.randomUUID()}`;
  
  const token = jwt.sign(
    { 
      guestId,
      role: 'guest',
      createdAt: Date.now()
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  console.log('[Assistant] Guest token created:', guestId);
  
  res.json({
    guestId,
    token,
    expiresIn: 86400, // 24 hours in seconds
    limitations: {
      rateLimit: '20 requests per day',
      allowedActions: ['show_trending', 'design_flyer', 'chat']
    }
  });
});

/**
 * GET /api/assistant/summary
 * Lightweight metrics for mini dashboard
 */
router.get('/summary', requireUserOrGuest, async (req, res) => {
  console.log(`[Assistant] Summary for ${req.isGuest ? 'guest' : 'user'} ${req.userId}`);
  
  // TODO: Query real data from database
  // For now, return mock data
  const summary = {
    campaigns: req.isGuest ? 0 : 12,
    reach7d: req.isGuest ? 0 : 1240,
    spend7d: req.isGuest ? 0 : 430,
    screensOnline: req.isGuest ? 0 : 5
  };
  
  res.json(summary);
});

/**
 * POST /api/assistant/chat
 * Send message to assistant
 */
router.post('/chat', requireUserOrGuest, async (req, res) => {
  const { message } = req.body;
  const context = extractContext(req);
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  console.log(`[Assistant] Chat from ${req.isGuest ? 'guest' : 'user'} ${req.userId}:`, message);
  
  // Check for OpenAI
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  
  let reply;
  const lowerMessage = message.toLowerCase();
  
  if (hasOpenAI) {
    // TODO: Implement OpenAI integration
    reply = generateMockReply(lowerMessage, context, req.isGuest);
  } else {
    reply = generateMockReply(lowerMessage, context, req.isGuest);
  }
  
  // Add upgrade prompt for guests on certain topics
  if (req.isGuest && (lowerMessage.includes('store') || lowerMessage.includes('screen'))) {
    reply += '\n\n💡 *Sign in to unlock full store management and screen features!*';
  }
  
  res.json({ reply });
});

/**
 * POST /api/assistant/action
 * Execute quick action
 */
router.post('/action', requireUserOrGuest, async (req, res) => {
  const { intent, payload } = req.body;
  const context = extractContext(req);
  
  if (!intent) {
    return res.status(400).json({ error: 'Intent is required' });
  }
  
  // Check permissions
  if (!canPerformAction(req, intent)) {
    return res.status(403).json({
      error: 'This action requires a full account',
      message: 'Sign in to unlock this feature',
      upgradeUrl: '/signup'
    });
  }
  
  console.log(`[Assistant] Action from ${req.isGuest ? 'guest' : 'user'} ${req.userId}: ${intent}`);
  
  // Handle intents
  switch (intent) {
    case 'show_trending':
      return res.json({
        status: 'ok',
        cards: [
          {
            title: 'Pumpkin Spice Latte Promo',
            kind: 'campaign',
            subtitle: 'Running now • 1.2K views',
            cta: '/dashboard/campaigns/123',
            icon: '🎃'
          },
          {
            title: 'Top 10 Flyers Trending',
            kind: 'flyer-list',
            subtitle: 'This week's most viewed',
            cta: '/designer/templates?sort=trending',
            icon: '🔥'
          },
          {
            title: 'Nail Spa Services',
            kind: 'service',
            subtitle: 'Sydney • $35',
            cta: '/services/nail-spa-123',
            icon: '💅'
          }
        ]
      });
    
    case 'create_store':
      if (req.isGuest) {
        return res.status(403).json({
          error: 'Sign in required',
          message: 'Create an account to set up your store'
        });
      }
      
      // Check if user has business
      if (req.user && req.user.hasBusiness) {
        return res.json({
          status: 'ok',
          next: {
            type: 'open-url',
            href: '/dashboard/store/settings',
            label: 'Open Store Settings'
          }
        });
      }
      
      return res.json({
        status: 'ok',
        next: {
          type: 'open-url',
          href: '/store/setup',
          label: 'Set Up Your Store'
        }
      });
    
    case 'design_flyer':
      const { title, offer, brandColor } = payload || {};
      
      // For guests: show preview only
      if (req.isGuest) {
        return res.json({
          status: 'ok',
          assetPreview: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
          message: 'Here\'s a preview! Sign in to customize and download.',
          next: {
            type: 'open-url',
            href: '/signup?intent=design_flyer',
            label: 'Sign In to Customize'
          }
        });
      }
      
      // For users: generate draft and open designer
      const draftId = crypto.randomUUID().split('-')[0];
      
      return res.json({
        status: 'ok',
        assetPreview: `https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80`,
        next: {
          type: 'open-url',
          href: `/designer?draft=${draftId}${title ? `&title=${encodeURIComponent(title)}` : ''}`,
          label: 'Open in Designer'
        }
      });
    
    case 'connect_screens':
      if (req.isGuest) {
        return res.status(403).json({
          error: 'Sign in required',
          message: 'Create an account to manage screens'
        });
      }
      
      // TODO: Query actual devices
      const hasDevices = false;
      
      if (hasDevices) {
        return res.json({
          status: 'ok',
          devices: [
            { id: '1', name: 'Store Front Display', status: 'online' },
            { id: '2', name: 'Window Screen', status: 'online' }
          ]
        });
      }
      
      return res.json({
        status: 'ok',
        next: {
          type: 'open-url',
          href: '/screens/setup',
          label: 'Set Up C-Net Screens'
        }
      });
    
    default:
      return res.status(400).json({ error: `Unknown intent: ${intent}` });
  }
});

/**
 * Generate mock chat reply
 */
function generateMockReply(message, context, isGuest) {
  if (message.includes('trending') || message.includes('popular')) {
    return "🔥 Here are today's trending items on Cardbey:\n\n• 🥖 Bánh mì Saigon - 1.2K views\n• 🍜 Phở specials - 890 views\n• 💅 Nail spa services - 650 views\n\nWant to see more? Click 'Show Trending' above!";
  }
  
  if (message.includes('store') || message.includes('business')) {
    if (isGuest) {
      return "I can help you set up a store! 🏪\n\nFirst, sign in to get started with your business on Cardbey. It only takes a minute!";
    }
    return "I can help you set up your store! You'll need:\n\n• Business name & category\n• Location & hours\n• Logo & description\n\nClick 'Create Store' above to get started!";
  }
  
  if (message.includes('screen') || message.includes('display')) {
    if (isGuest) {
      return "Digital screens help you reach more customers! 📺\n\nSign in to connect and manage your C-Net displays.";
    }
    return "To connect digital screens:\n\n1. Go to Settings → C-Net\n2. Add your device code\n3. Configure playlists\n\nClick 'Connect Screens' above for quick setup!";
  }
  
  if (message.includes('flyer') || message.includes('design') || message.includes('marketing')) {
    return "I can help you create professional marketing materials! 🎨\n\nClick 'Design Flyer' above and I'll generate a custom design based on your brand.";
  }
  
  // Generic helpful response
  const greeting = isGuest ? "Hi there! I'm the Cardbey Assistant. 🤖" : "Hi! I'm here to help! 🤖";
  return `${greeting}\n\nI can help you with:\n• 🔥 Show trending items\n• 🏪 Create your store${isGuest ? ' (sign in required)' : ''}\n• 🎨 Design flyers\n• 📺 Connect screens${isGuest ? ' (sign in required)' : ''}\n\nWhat would you like to try?`;
}

export default router;

