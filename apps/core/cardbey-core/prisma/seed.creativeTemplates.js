/**
 * Seed Creative Templates with default metadata
 * Run with: node prisma/seed.creativeTemplates.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default metadata values for system templates
const DEFAULT_METADATA = {
  channels: ['cnet_screen', 'storefront', 'social'],
  role: 'generic',
  primaryIntent: 'general_design',
  orientation: 'any',
  tags: ['universal', 'default'],
  isSystem: true,
  isActive: true,
};

// Sample system templates with sensible defaults
const SYSTEM_TEMPLATES = [
  {
    name: 'Universal Promo Banner',
    description: 'A versatile promotional banner template suitable for any channel',
    channels: ['cnet_screen', 'storefront', 'social'],
    role: 'promo_banner',
    primaryIntent: 'promote_offer',
    orientation: 'horizontal',
    tags: ['promo', 'sale', 'universal'],
    isSystem: true,
    isActive: true,
  },
  {
    name: 'Menu Display Card',
    description: 'Template for displaying menu items and product information',
    channels: ['cnet_screen', 'storefront'],
    role: 'menu_display',
    primaryIntent: 'show_product_info',
    orientation: 'vertical',
    tags: ['menu', 'product', 'food'],
    isSystem: true,
    isActive: true,
  },
  {
    name: 'Brand Identity Showcase',
    description: 'Template for showcasing brand identity and messaging',
    channels: ['cnet_screen', 'social'],
    role: 'brand_showcase',
    primaryIntent: 'build_brand_awareness',
    orientation: 'square',
    tags: ['brand', 'identity', 'marketing'],
    isSystem: true,
    isActive: true,
  },
  {
    name: 'Event Announcement',
    description: 'Template for announcing events, promotions, or special occasions',
    channels: ['cnet_screen', 'storefront', 'social'],
    role: 'event_announcement',
    primaryIntent: 'announce_event',
    orientation: 'horizontal',
    tags: ['event', 'announcement', 'promotion'],
    isSystem: true,
    isActive: true,
  },
  {
    name: 'Generic Marketing Asset',
    description: 'A generic template suitable for various marketing purposes',
    ...DEFAULT_METADATA,
    name: 'Generic Marketing Asset',
  },
];

async function seedCreativeTemplates() {
  console.log('🌱 Seeding Creative Templates...\n');

  // Check if CreativeTemplate model exists
  if (!prisma.creativeTemplate) {
    console.error('❌ CreativeTemplate model not available. Please run: npx prisma generate');
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const templateData of SYSTEM_TEMPLATES) {
    try {
      // Check if template with same name already exists
      const existing = await prisma.creativeTemplate.findFirst({
        where: {
          name: templateData.name,
          isSystem: true,
        },
      });

      if (existing) {
        // Update existing template with default metadata if missing
        const needsUpdate = 
          !existing.role ||
          !existing.primaryIntent ||
          !existing.orientation ||
          existing.channels === '[]' ||
          existing.tags === '[]' ||
          existing.isActive === false;

        if (needsUpdate) {
          await prisma.creativeTemplate.update({
            where: { id: existing.id },
            data: {
              role: existing.role || templateData.role,
              primaryIntent: existing.primaryIntent || templateData.primaryIntent,
              orientation: existing.orientation || templateData.orientation,
              channels: existing.channels === '[]' 
                ? JSON.stringify(templateData.channels)
                : existing.channels,
              tags: existing.tags === '[]'
                ? JSON.stringify(templateData.tags)
                : existing.tags,
              isActive: templateData.isActive,
            },
          });
          updated++;
          console.log(`  ✅ Updated: ${templateData.name}`);
        } else {
          skipped++;
          console.log(`  ⏭️  Skipped: ${templateData.name} (already has metadata)`);
        }
      } else {
        // Create new template
        await prisma.creativeTemplate.create({
          data: {
            tenantId: null, // System templates are global
            storeId: null,
            name: templateData.name,
            description: templateData.description || null,
            thumbnailUrl: null,
            baseContentId: null,
            channels: JSON.stringify(templateData.channels),
            role: templateData.role,
            primaryIntent: templateData.primaryIntent,
            orientation: templateData.orientation,
            tags: JSON.stringify(templateData.tags),
            isSystem: templateData.isSystem,
            isActive: templateData.isActive,
          },
        });
        created++;
        console.log(`  ✅ Created: ${templateData.name}`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${templateData.name}:`, error.message);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`\n✅ Seeding complete!\n`);

  await prisma.$disconnect();
}

seedCreativeTemplates().catch((error) => {
  console.error('❌ Seeding error:', error);
  process.exit(1);
});

