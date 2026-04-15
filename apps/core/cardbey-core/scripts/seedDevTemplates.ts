/**
 * Seed development templates for Smart Template Picker
 * 
 * Run with: npx tsx scripts/seedDevTemplates.ts
 */

import { PrismaClient } from '@prisma/client';
import * as miService from '../src/services/miService.js';

const prisma = new PrismaClient();

async function seedTemplates() {
  console.log('🌱 Seeding development templates...');

  // Check if CreativeTemplate model exists
  // @ts-ignore - runtime safety check
  if (!prisma.creativeTemplate || typeof prisma.creativeTemplate.count !== 'function') {
    console.error('❌ CreativeTemplate model not available. Please run:');
    console.error('   npx prisma generate');
    console.error('   npx prisma migrate dev --name add_creative_template');
    process.exit(1);
  }

  // Idempotent seeding: update existing templates or create new ones
  console.log('📋 Checking for existing templates...');

  // Get a user ID for createdByUserId (use admin or first user)
  let adminUser = await prisma.user.findFirst({
    where: { email: 'admin' },
  });
  
  if (!adminUser) {
    // Fallback to first user
    adminUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
    });
  }
  
  if (!adminUser) {
    console.error('❌ No users found. Please create a user first.');
    process.exit(1);
  }

  const userId = adminUser.id;
  console.log(`👤 Using user: ${adminUser.email || adminUser.id}`);

  // ============================================
  // STARTER TEMPLATES (3 new system templates)
  // ============================================
  
  console.log('\n📦 Seeding 3 starter templates...\n');

  // Helper function to create or update template
  async function upsertTemplate(templateData: {
    name: string;
    description: string;
    channels: string[];
    role: string;
    primaryIntent: string;
    orientation: string;
    tags: string[];
    fields: any;
    aiContext: any;
    canvasNodes: any[];
    canvasSettings?: any;
    // Phase 2: Business type and use case metadata
    businessCategories?: string[];
    useCases?: string[];
    styleTags?: string[];
  }) {
    const existing = await prisma.creativeTemplate.findFirst({
      where: { name: templateData.name, isSystem: true },
    });

    // Create base Content for canvas
    let baseContent;
    if (existing?.baseContentId) {
      // Update existing base content
      baseContent = await prisma.content.update({
        where: { id: existing.baseContentId },
        data: {
          elements: templateData.canvasNodes,
          settings: templateData.canvasSettings || {
            backgroundColor: '#0f172a',
            gridEnabled: false,
            gridSize: 20,
            backgroundLocked: false,
            layoutMode: 'split',
            backgroundSide: 'left',
          },
        },
      });
    } else {
      // Create new base content
      baseContent = await prisma.content.create({
        data: {
          name: `Base Content - ${templateData.name}`,
          userId: userId,
          elements: templateData.canvasNodes,
          settings: templateData.canvasSettings || {
            backgroundColor: '#0f172a',
            gridEnabled: false,
            gridSize: 20,
            backgroundLocked: false,
            layoutMode: 'split',
            backgroundSide: 'left',
          },
          version: 1,
        },
      });
    }

    if (existing) {
      // Update existing template
      const updated = await prisma.creativeTemplate.update({
        where: { id: existing.id },
        data: {
          description: templateData.description,
          baseContentId: baseContent.id,
          channels: JSON.stringify(templateData.channels),
          role: templateData.role,
          primaryIntent: templateData.primaryIntent,
          orientation: templateData.orientation,
          tags: JSON.stringify(templateData.tags),
          fields: JSON.stringify(templateData.fields),
          aiContext: JSON.stringify(templateData.aiContext),
          businessCategories: templateData.businessCategories ? JSON.stringify(templateData.businessCategories) : null,
          useCases: templateData.useCases ? JSON.stringify(templateData.useCases) : null,
          styleTags: templateData.styleTags ? JSON.stringify(templateData.styleTags) : null,
          isActive: true,
        },
      });
      console.log(`  ✅ Updated: ${templateData.name} (${updated.id})`);
      return updated;
    } else {
      // Create new template
      const created = await prisma.creativeTemplate.create({
        data: {
          name: templateData.name,
          description: templateData.description,
          thumbnailUrl: null,
          tenantId: null,
          storeId: null,
          baseContentId: baseContent.id,
          channels: JSON.stringify(templateData.channels),
          role: templateData.role,
          primaryIntent: templateData.primaryIntent,
          orientation: templateData.orientation,
          minDurationS: null,
          maxDurationS: null,
          tags: JSON.stringify(templateData.tags),
          businessCategories: templateData.businessCategories ? JSON.stringify(templateData.businessCategories) : null,
          useCases: templateData.useCases ? JSON.stringify(templateData.useCases) : null,
          styleTags: templateData.styleTags ? JSON.stringify(templateData.styleTags) : null,
          isSystem: true,
          isActive: true,
          fields: JSON.stringify(templateData.fields),
          aiContext: JSON.stringify(templateData.aiContext),
        },
      });
      console.log(`  ✅ Created: ${templateData.name} (${created.id})`);
      return created;
    }
  }

  // Template 1: CNET Vertical Poster – Promo
  const template1 = await upsertTemplate({
    name: 'CNET Vertical Poster – Promo',
    description: 'Digital signage (vertical 9:16) for C-Net screens — big headline, image, CTA, business branding',
    channels: ['cnet_screen'],
    role: 'generic',
    primaryIntent: 'promo_poster',
    orientation: 'portrait', // vertical = portrait
    tags: ['poster', 'promo', 'cnet', 'vertical'],
    businessCategories: ['cafe', 'restaurant', 'bakery', 'retail', 'general'],
    useCases: ['promo', 'hero'],
    styleTags: ['bold', 'high-contrast', 'modern'],
    fields: {
      slots: [
        {
          id: 'headline',
          label: 'Headline',
          type: 'text',
          required: true,
          defaultValue: 'Big Sale Today!',
          description: 'Main large text for the poster',
        },
        {
          id: 'subheadline',
          label: 'Subheadline',
          type: 'text',
          defaultValue: 'Up to 50% off selected items',
          description: 'Secondary text or offer details',
        },
        {
          id: 'cta',
          label: 'Call To Action',
          type: 'text',
          defaultValue: 'Visit Us Now!',
          description: 'Short call to action',
        },
        {
          id: 'businessName',
          label: 'Business Name',
          type: 'text',
          sourceKey: 'business.name',
        },
        {
          id: 'brandColor',
          label: 'Brand Color',
          type: 'color',
          sourceKey: 'business.primaryColor',
        },
      ],
    },
    aiContext: {
      tone: 'energetic',
      audience: 'general_customers',
      language: 'en',
      styleHints: ['bold', 'high-contrast', 'retail'],
    },
    canvasNodes: [
      {
        id: 'headlineNode',
        kind: 'text',
        name: 'Headline',
        text: '{{headline}}',
        x: 60,
        y: 120,
        width: 600,
        height: 120,
        fontSize: 72,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'headline' },
      },
      {
        id: 'subheadlineNode',
        kind: 'text',
        name: 'Subheadline',
        text: '{{subheadline}}',
        x: 60,
        y: 260,
        width: 600,
        height: 100,
        fontSize: 42,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'subheadline' },
      },
      {
        id: 'ctaNode',
        kind: 'text',
        name: 'CTA',
        text: '{{cta}}',
        x: 60,
        y: 380,
        width: 400,
        height: 80,
        fontSize: 48,
        fontFamily: 'Inter',
        fill: '#ffcc00',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'cta' },
      },
      {
        id: 'businessNode',
        kind: 'text',
        name: 'Business Name',
        text: '{{businessName}}',
        x: 60,
        y: 1700,
        width: 500,
        height: 60,
        fontSize: 32,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'businessName' },
      },
    ],
    canvasSettings: {
      backgroundColor: '#1a1a2e',
      gridEnabled: false,
      gridSize: 20,
      backgroundLocked: false,
      layoutMode: 'split',
      backgroundSide: 'left',
      backgroundWidth: 1080, // Vertical 9:16
      backgroundHeight: 1920,
    },
  });

  // Template 2: Storefront Promo Banner – Landscape
  const template2 = await upsertTemplate({
    name: 'Storefront Promo Banner – Landscape',
    description: 'Promotional banner for storefront / web-store homepage. 16:9 landscape',
    channels: ['storefront', 'web'],
    role: 'generic',
    primaryIntent: 'promo_banner',
    orientation: 'landscape', // horizontal = landscape
    tags: ['banner', 'promo', 'storefront'],
    businessCategories: ['cafe', 'restaurant', 'bakery', 'retail', 'general'],
    useCases: ['hero', 'promo'],
    styleTags: ['clean', 'modern', 'minimal'],
    fields: {
      slots: [
        {
          id: 'title',
          label: 'Title',
          type: 'text',
          defaultValue: 'Special Offer This Week!',
        },
        {
          id: 'description',
          label: 'Description',
          type: 'richtext',
          defaultValue: 'Enjoy great deals on our best-selling products.',
        },
        {
          id: 'cta',
          label: 'CTA',
          type: 'text',
          defaultValue: 'Shop Now',
        },
        {
          id: 'brandColor',
          label: 'Brand Color',
          type: 'color',
          sourceKey: 'business.primaryColor',
        },
        {
          id: 'businessName',
          label: 'Business Name',
          type: 'text',
          sourceKey: 'business.name',
        },
      ],
    },
    aiContext: {
      tone: 'friendly',
      audience: 'online_buyers',
      language: 'en',
      styleHints: ['clean', 'modern', 'minimal'],
    },
    canvasNodes: [
      {
        id: 'titleNode',
        kind: 'text',
        name: 'Title',
        text: '{{title}}',
        x: 80,
        y: 140,
        width: 800,
        height: 100,
        fontSize: 60,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'title' },
      },
      {
        id: 'descNode',
        kind: 'text',
        name: 'Description',
        text: '{{description}}',
        x: 80,
        y: 240,
        width: 800,
        height: 120,
        fontSize: 36,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.4,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'description' },
      },
      {
        id: 'ctaNode',
        kind: 'text',
        name: 'CTA',
        text: '{{cta}}',
        x: 80,
        y: 420,
        width: 300,
        height: 80,
        fontSize: 48,
        fontFamily: 'Inter',
        fill: '#ffcc00',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'cta' },
      },
      {
        id: 'brandColorBox',
        kind: 'rectangle',
        name: 'Brand Color Background',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        fill: '#1a1a2e',
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: 0,
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: true,
        // Note: brandColor slot is for reference, not directly applied to rectangle fill
        // In a real implementation, you'd apply the color value from slotValues
      },
    ],
    canvasSettings: {
      backgroundColor: '#1a1a2e',
      gridEnabled: false,
      gridSize: 20,
      backgroundLocked: false,
      layoutMode: 'split',
      backgroundSide: 'left',
      backgroundWidth: 1920, // Horizontal 16:9
      backgroundHeight: 1080,
    },
  });

  // Template 3: Social Square Promo
  const template3 = await upsertTemplate({
    name: 'Social Square Promo',
    description: 'Perfect for Instagram / TikTok feed — bold headline + hero image + CTA',
    channels: ['social'],
    role: 'generic',
    primaryIntent: 'social_post',
    orientation: 'square',
    tags: ['social', 'square', 'promo'],
    businessCategories: ['cafe', 'restaurant', 'bakery', 'retail', 'general'],
    useCases: ['social', 'promo'],
    styleTags: ['trendy', 'bold', 'high-contrast'],
    fields: {
      slots: [
        {
          id: 'headline',
          label: 'Headline',
          type: 'text',
          defaultValue: 'New Arrival!',
        },
        {
          id: 'subtitle',
          label: 'Subtitle',
          type: 'text',
          defaultValue: 'Check out our latest collection.',
        },
        {
          id: 'cta',
          label: 'CTA',
          type: 'text',
          defaultValue: 'Learn More',
        },
        {
          id: 'brandColor',
          label: 'Brand Color',
          type: 'color',
          sourceKey: 'business.primaryColor',
        },
        {
          id: 'businessName',
          label: 'Business Name',
          type: 'text',
          sourceKey: 'business.name',
        },
      ],
    },
    aiContext: {
      tone: 'youthful',
      audience: 'social_media_users',
      language: 'en',
      styleHints: ['trendy', 'bold', 'high_contrast'],
    },
    canvasNodes: [
      {
        id: 'headlineNode',
        kind: 'text',
        name: 'Headline',
        text: '{{headline}}',
        x: 80,
        y: 120,
        width: 800,
        height: 100,
        fontSize: 56,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'headline' },
      },
      {
        id: 'subtitleNode',
        kind: 'text',
        name: 'Subtitle',
        text: '{{subtitle}}',
        x: 80,
        y: 220,
        width: 800,
        height: 100,
        fontSize: 36,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.4,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'subtitle' },
      },
      {
        id: 'ctaNode',
        kind: 'text',
        name: 'CTA',
        text: '{{cta}}',
        x: 80,
        y: 360,
        width: 300,
        height: 80,
        fontSize: 48,
        fontFamily: 'Inter',
        fill: '#ffcc00',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'cta' },
      },
    ],
    canvasSettings: {
      backgroundColor: '#1a1a2e',
      gridEnabled: false,
      gridSize: 20,
      backgroundLocked: false,
      layoutMode: 'split',
      backgroundSide: 'left',
      backgroundWidth: 1080, // Square 1:1
      backgroundHeight: 1080,
    },
  });

  // Template 4: Menu Display Card
  const template4 = await upsertTemplate({
    name: 'Menu Display Card',
    description: 'Template for displaying menu items and product information — perfect for cafes and restaurants',
    channels: ['cnet_screen', 'storefront'],
    role: 'menu_display',
    primaryIntent: 'show_product_info',
    orientation: 'portrait',
    tags: ['menu', 'product', 'food', 'display'],
    businessCategories: ['cafe', 'restaurant', 'bakery', 'food'],
    useCases: ['menu'],
    styleTags: ['clean', 'readable', 'organized'],
    fields: {
      slots: [
        {
          id: 'itemName',
          label: 'Item Name',
          type: 'text',
          defaultValue: 'Signature Coffee',
        },
        {
          id: 'itemDescription',
          label: 'Item Description',
          type: 'richtext',
          defaultValue: 'Rich, bold espresso with a smooth finish',
        },
        {
          id: 'itemPrice',
          label: 'Price',
          type: 'text',
          defaultValue: '$4.99',
        },
        {
          id: 'businessName',
          label: 'Business Name',
          type: 'text',
          sourceKey: 'business.name',
        },
        {
          id: 'brandColor',
          label: 'Brand Color',
          type: 'color',
          sourceKey: 'business.primaryColor',
        },
      ],
    },
    aiContext: {
      tone: 'professional',
      audience: 'dining_customers',
      language: 'en',
      styleHints: ['clean', 'readable', 'organized'],
    },
    canvasNodes: [
      {
        id: 'itemNameNode',
        kind: 'text',
        name: 'Item Name',
        text: '{{itemName}}',
        x: 60,
        y: 100,
        width: 600,
        height: 80,
        fontSize: 48,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'itemName' },
      },
      {
        id: 'itemDescNode',
        kind: 'text',
        name: 'Item Description',
        text: '{{itemDescription}}',
        x: 60,
        y: 200,
        width: 600,
        height: 200,
        fontSize: 32,
        fontFamily: 'Inter',
        fill: '#e0e0e0',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.4,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'itemDescription' },
      },
      {
        id: 'itemPriceNode',
        kind: 'text',
        name: 'Price',
        text: '{{itemPrice}}',
        x: 60,
        y: 420,
        width: 300,
        height: 60,
        fontSize: 42,
        fontFamily: 'Inter',
        fill: '#ffcc00',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'itemPrice' },
      },
    ],
    canvasSettings: {
      backgroundColor: '#1a1a2e',
      gridEnabled: false,
      gridSize: 20,
      backgroundLocked: false,
      layoutMode: 'split',
      backgroundSide: 'left',
      backgroundWidth: 720, // Portrait 9:16
      backgroundHeight: 1280,
    },
  });

  // Template 5: Cafe Hero Banner
  const template5 = await upsertTemplate({
    name: 'Cafe Hero Banner',
    description: 'Hero banner for cafe/restaurant homepage — welcoming, warm, showcases brand',
    channels: ['storefront', 'web'],
    role: 'hero_banner',
    primaryIntent: 'welcome_visitors',
    orientation: 'landscape',
    tags: ['hero', 'banner', 'welcome', 'cafe'],
    businessCategories: ['cafe', 'restaurant', 'bakery'],
    useCases: ['hero'],
    styleTags: ['warm', 'welcoming', 'modern'],
    fields: {
      slots: [
        {
          id: 'heroTitle',
          label: 'Hero Title',
          type: 'text',
          defaultValue: 'Welcome to Our Cafe',
        },
        {
          id: 'heroSubtitle',
          label: 'Hero Subtitle',
          type: 'text',
          defaultValue: 'Fresh coffee, warm atmosphere, great company',
        },
        {
          id: 'tagline',
          label: 'Tagline',
          type: 'text',
          sourceKey: 'business.tagline',
        },
        {
          id: 'businessName',
          label: 'Business Name',
          type: 'text',
          sourceKey: 'business.name',
        },
        {
          id: 'primaryColor',
          label: 'Primary Brand Color',
          type: 'color',
          sourceKey: 'business.primaryColor',
        },
      ],
    },
    aiContext: {
      tone: 'warm',
      audience: 'visiting_customers',
      language: 'en',
      styleHints: ['welcoming', 'cozy', 'modern'],
    },
    canvasNodes: [
      {
        id: 'heroTitleNode',
        kind: 'text',
        name: 'Hero Title',
        text: '{{heroTitle}}',
        x: 100,
        y: 200,
        width: 1000,
        height: 120,
        fontSize: 72,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'heroTitle' },
      },
      {
        id: 'heroSubtitleNode',
        kind: 'text',
        name: 'Hero Subtitle',
        text: '{{heroSubtitle}}',
        x: 100,
        y: 340,
        width: 1000,
        height: 100,
        fontSize: 42,
        fontFamily: 'Inter',
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.4,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'heroSubtitle' },
      },
      {
        id: 'taglineNode',
        kind: 'text',
        name: 'Tagline',
        text: '{{tagline}}',
        x: 100,
        y: 460,
        width: 800,
        height: 60,
        fontSize: 32,
        fontFamily: 'Inter',
        fill: '#ffcc00',
        stroke: 'transparent',
        strokeWidth: 0,
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        meta: { templateSlotId: 'tagline' },
      },
    ],
    canvasSettings: {
      backgroundColor: '#1a1a2e',
      gridEnabled: false,
      gridSize: 20,
      backgroundLocked: false,
      layoutMode: 'split',
      backgroundSide: 'left',
      backgroundWidth: 1920, // Landscape 16:9
      backgroundHeight: 1080,
    },
  });

  // Register MIEntity for each template
  const templates = [template1, template2, template3, template4, template5];
  for (const template of templates) {
    try {
      await miService.registerOrUpdateEntity({
        productId: template.id,
        productType: 'generic',
        mediaType: 'image',
        fileUrl: template.thumbnailUrl || `https://placeholder.com/template-${template.id}`,
        previewUrl: template.thumbnailUrl || null,
        orientation: template.orientation || undefined,
        createdByUserId: userId,
        createdByEngine: 'template_seeder',
        miBrain: {
          role: template.role || 'generic',
          primaryIntent: template.primaryIntent || 'general_design',
          context: {
            channels: JSON.parse(template.channels),
            environmentHints: {
              screenOrientation: template.orientation || 'any',
            },
          },
          capabilities: {},
          behaviorRules: {},
        },
        links: {
          templateId: template.id,
        },
      });
      console.log(`   ✅ Registered MIEntity for ${template.name}`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to register MIEntity for ${template.name}:`, err);
    }
  }

  console.log('\n✅ Seeding complete!');
  console.log(`   Processed ${templates.length} starter templates`);
  console.log(`\n📋 Template IDs:`);
  templates.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name}: ${t.id}`);
  });
}

async function main() {
  try {
    await seedTemplates();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

