/**
 * Seed MI Video Templates
 * Run with: node scripts/seedMiVideoTemplates.js
 * Or: npm run seed:mi-video-templates
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding MI Video Templates...\n');

  // Check if MiVideoTemplate model exists
  if (!prisma.miVideoTemplate) {
    console.error('❌ MiVideoTemplate model not available. Please run: npx prisma generate');
    await prisma.$disconnect();
    return;
  }

  const templates = [
    {
      key: 'GEN_CARD_BEY_BG_1',
      label: 'Cardbey Background',
      occasionType: 'generic',
      orientation: 'landscape',
      // IMPORTANT: use relative paths; the frontend will resolve them to the dashboard origin.
      backgroundUrl: '/videos/cardbey-bg.mp4',
      posterUrl: '/videos/cardbey-bg.mp4', // Using video as poster (or can be replaced with a still image later)
      textZonesJson: {
        title: { x: 0.5, y: 0.30, maxWidth: 0.8 },
        message: { x: 0.5, y: 0.55, maxWidth: 0.8 },
        signature: { x: 0.5, y: 0.82, maxWidth: 0.6 },
      },
      textStylesJson: {
        title: { color: '#FFFFFF', fontSize: 40 },
        message: { color: '#F9FAFB', fontSize: 22 },
        signature: { color: '#E5E7EB', fontSize: 18, italic: true },
      },
      isActive: true,
    },
    {
      key: 'XMAS_COZY_FIREPLACE_1',
      label: 'Christmas Cozy Fireplace',
      occasionType: 'christmas_2025',
      orientation: 'vertical', // video is tall
      backgroundUrl: '/videos/christmas-cozy-fireplace.mp4',
      posterUrl: '/videos/christmas-cozy-fireplace.mp4', // Using video as poster (or can be replaced with a JPG if created later)
      textZonesJson: {
        title: { x: 0.5, y: 0.25, maxWidth: 0.78 },
        message: { x: 0.5, y: 0.50, maxWidth: 0.78 },
        signature: { x: 0.5, y: 0.80, maxWidth: 0.65 },
      },
      textStylesJson: {
        title: { color: '#FFE9A6', fontSize: 42, shadow: true },
        message: { color: '#FFF8E7', fontSize: 22 },
        signature: { color: '#FFE9A6', fontSize: 18, italic: true },
      },
      isActive: true,
    },
  ];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const tpl of templates) {
    try {
      const existing = await prisma.miVideoTemplate.findUnique({
        where: { key: tpl.key },
      });

      if (existing) {
        // Update existing template
        await prisma.miVideoTemplate.update({
          where: { key: tpl.key },
          data: tpl,
        });
        updated++;
        console.log(`  ✅ Updated: ${tpl.label} (${tpl.key})`);
      } else {
        // Create new template
        await prisma.miVideoTemplate.create({
          data: tpl,
        });
        created++;
        console.log(`  ✅ Created: ${tpl.label} (${tpl.key})`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${tpl.key}:`, error.message);
      skipped++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`\n✅ Seeding complete!\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

