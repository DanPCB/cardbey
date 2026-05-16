/**
 * Verify MI Video Templates
 * Quick script to check if templates are registered
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verifying MI Video Templates...\n');

  const templates = await prisma.miVideoTemplate.findMany({
    select: {
      key: true,
      label: true,
      backgroundUrl: true,
      occasionType: true,
      orientation: true,
      isActive: true,
    },
    orderBy: { key: 'asc' },
  });

  if (templates.length === 0) {
    console.log('❌ No templates found in database');
  } else {
    console.log(`✅ Found ${templates.length} template(s):\n`);
    templates.forEach((t) => {
      console.log(`  ${t.key}: ${t.label}`);
      console.log(`    Occasion: ${t.occasionType}`);
      console.log(`    Orientation: ${t.orientation}`);
      console.log(`    Background: ${t.backgroundUrl}`);
      console.log(`    Active: ${t.isActive}`);
      console.log('');
    });
  }

  // Check for the specific templates we need
  const requiredKeys = ['GEN_CARD_BEY_BG_1', 'XMAS_COZY_FIREPLACE_1'];
  const foundKeys = templates.map((t) => t.key);
  const missingKeys = requiredKeys.filter((key) => !foundKeys.includes(key));

  if (missingKeys.length > 0) {
    console.log(`⚠️  Missing required templates: ${missingKeys.join(', ')}`);
  } else {
    console.log('✅ All required templates are present!');
  }
}

main()
  .catch((e) => {
    console.error('❌ Verification error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

