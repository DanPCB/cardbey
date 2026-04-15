/**
 * Migration script to update existing CreativeTemplate records with default metadata
 * Run with: node scripts/update-template-metadata.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default metadata values to apply to templates missing fields
const DEFAULT_METADATA = {
  channels: ['cnet_screen', 'storefront', 'social'],
  role: 'generic',
  primaryIntent: 'general_design',
  orientation: 'any',
  tags: ['universal', 'default'],
};

async function updateTemplateMetadata() {
  console.log('🔄 Updating CreativeTemplate metadata...\n');

  // Check if CreativeTemplate model exists
  if (!prisma.creativeTemplate) {
    console.error('❌ CreativeTemplate model not available. Please run: npx prisma generate');
    await prisma.$disconnect();
    return;
  }

  // Find all templates missing required metadata
  const templates = await prisma.creativeTemplate.findMany({
    where: {
      OR: [
        { role: null },
        { primaryIntent: null },
        { orientation: null },
        { channels: '[]' },
        { tags: '[]' },
        { isActive: false },
      ],
    },
  });

  if (templates.length === 0) {
    console.log('✅ All templates already have metadata. No updates needed.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Found ${templates.length} template(s) needing metadata updates:\n`);

  let updated = 0;
  let skipped = 0;

  for (const template of templates) {
    try {
      const updateData = {};

      // Only update fields that are missing or empty
      if (!template.role) {
        updateData.role = DEFAULT_METADATA.role;
      }
      if (!template.primaryIntent) {
        updateData.primaryIntent = DEFAULT_METADATA.primaryIntent;
      }
      if (!template.orientation) {
        updateData.orientation = DEFAULT_METADATA.orientation;
      }
      if (template.channels === '[]' || !template.channels) {
        updateData.channels = JSON.stringify(DEFAULT_METADATA.channels);
      }
      if (template.tags === '[]' || !template.tags) {
        updateData.tags = JSON.stringify(DEFAULT_METADATA.tags);
      }
      if (template.isActive === false) {
        updateData.isActive = true;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.creativeTemplate.update({
          where: { id: template.id },
          data: updateData,
        });
        updated++;
        console.log(`  ✅ Updated: ${template.name}`);
        console.log(`     Applied: ${Object.keys(updateData).join(', ')}`);
      } else {
        skipped++;
        console.log(`  ⏭️  Skipped: ${template.name} (no changes needed)`);
      }
    } catch (error) {
      console.error(`  ❌ Error updating ${template.name}:`, error.message);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`\n✅ Update complete!\n`);

  await prisma.$disconnect();
}

updateTemplateMetadata().catch((error) => {
  console.error('❌ Update error:', error);
  process.exit(1);
});

