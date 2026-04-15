/**
 * Journey Templates Seed Data
 * Creates 3 starter templates: Launch Store, Weekend Promo, Connect Screens
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedJourneys() {
  console.log('🌱 Seeding Journey Templates...');

  // 1. Launch Store in 60 min
  const launchStore = await prisma.journeyTemplate.upsert({
    where: { slug: 'launch-store-60' },
    update: {},
    create: {
      slug: 'launch-store-60',
      title: 'Launch Store in 60 Minutes',
      summary: 'Set up your online store from menu scan to live in under an hour',
      category: 'store',
      tags: JSON.stringify(['quick', 'beginner', 'essential']),
      steps: {
        create: [
          {
            orderIndex: 0,
            title: 'Create Your Store',
            hint: 'Enter your business name, address, and operating hours',
            kind: 'FORM',
            action: 'CREATE_STORE',
            paramsJson: JSON.stringify({
              fields: ['name', 'address', 'hours', 'category'],
              defaults: { hours: '9am-5pm Mon-Fri' }
            })
          },
          {
            orderIndex: 1,
            title: 'Scan Your Menu',
            hint: 'Use AI OCR to extract products from your menu photo',
            kind: 'ACTION',
            action: 'NONE', // Routes to existing OCR pipeline
            paramsJson: JSON.stringify({
              type: 'ocr_menu',
              acceptedFormats: ['jpg', 'png', 'pdf']
            })
          },
          {
            orderIndex: 2,
            title: 'Review & Adjust',
            hint: 'Check auto-detected prices and categories',
            kind: 'REVIEW',
            action: 'NONE',
            paramsJson: JSON.stringify({
              reviewFields: ['prices', 'categories', 'descriptions']
            })
          },
          {
            orderIndex: 3,
            title: 'Publish Your Store',
            hint: 'Make your store live and get your shareable link',
            kind: 'ACTION',
            action: 'NONE', // Marks store as published
            paramsJson: JSON.stringify({
              autoShare: true,
              generateQR: true
            })
          }
        ]
      }
    },
    include: { steps: true }
  });

  console.log(`✅ Created: ${launchStore.title} (${launchStore.steps.length} steps)`);

  // 2. Weekend Promo
  const weekendPromo = await prisma.journeyTemplate.upsert({
    where: { slug: 'weekend-promo' },
    update: {},
    create: {
      slug: 'weekend-promo',
      title: 'Weekend Promo Campaign',
      summary: 'Design, publish, and track a promotional campaign across all channels',
      category: 'marketing',
      tags: JSON.stringify(['marketing', 'campaign', 'social']),
      steps: {
        create: [
          {
            orderIndex: 0,
            title: 'Design Your Flyer',
            hint: 'Create a promotional flyer with AI assistance',
            kind: 'FORM',
            action: 'DESIGN_FLYER',
            paramsJson: JSON.stringify({
              fields: ['title', 'offer', 'brandColor', 'cta'],
              defaults: { cta: 'Shop Now' }
            })
          },
          {
            orderIndex: 1,
            title: 'Create Social Campaign',
            hint: 'Post your promo to social media channels',
            kind: 'ACTION',
            action: 'CREATE_CAMPAIGN',
            paramsJson: JSON.stringify({
              platforms: ['facebook', 'instagram'],
              scheduleOptions: true
            })
          },
          {
            orderIndex: 2,
            title: 'Publish to Screens',
            hint: 'Display your promo on connected C-Net screens',
            kind: 'ACTION',
            action: 'PUBLISH_SCREEN',
            paramsJson: JSON.stringify({
              duration: '48h',
              priority: 'high'
            })
          },
          {
            orderIndex: 3,
            title: 'Review Metrics',
            hint: 'Check performance on Monday (auto-scheduled)',
            kind: 'REVIEW',
            action: 'NONE',
            paramsJson: JSON.stringify({
              scheduledFor: 'monday_9am',
              metrics: ['views', 'clicks', 'conversions']
            })
          }
        ]
      }
    },
    include: { steps: true }
  });

  console.log(`✅ Created: ${weekendPromo.title} (${weekendPromo.steps.length} steps)`);

  // 3. Connect Screens
  const connectScreens = await prisma.journeyTemplate.upsert({
    where: { slug: 'connect-screens' },
    update: {},
    create: {
      slug: 'connect-screens',
      title: 'Connect C-Net Screens',
      summary: 'Pair your display, set up playlists, and test your first broadcast',
      category: 'screens',
      tags: JSON.stringify(['screens', 'setup', 'hardware']),
      steps: {
        create: [
          {
            orderIndex: 0,
            title: 'Pairing Guide',
            hint: 'Learn how to pair your C-Net device',
            kind: 'INFO',
            action: 'NONE',
            paramsJson: JSON.stringify({
              videoUrl: '/guides/pair-cnet-screen.mp4',
              estimatedTime: '3 minutes'
            })
          },
          {
            orderIndex: 1,
            title: 'Pair Your Device',
            hint: 'Enter the 6-digit code displayed on your screen',
            kind: 'FORM',
            action: 'NONE', // Handled by screens service
            paramsJson: JSON.stringify({
              fields: ['pairingCode', 'deviceName'],
              validation: { pairingCode: 'length:6,numeric' }
            })
          },
          {
            orderIndex: 2,
            title: 'Select Playlist',
            hint: 'Choose what content to display on this screen',
            kind: 'FORM',
            action: 'NONE',
            paramsJson: JSON.stringify({
              fields: ['playlistId', 'loopMode'],
              defaults: { loopMode: 'continuous' }
            })
          },
          {
            orderIndex: 3,
            title: 'Publish & Test',
            hint: 'Go live and preview your screen remotely',
            kind: 'ACTION',
            action: 'PUBLISH_SCREEN',
            paramsJson: JSON.stringify({
              testMode: true,
              previewUrl: true
            })
          }
        ]
      }
    },
    include: { steps: true }
  });

  console.log(`✅ Created: ${connectScreens.title} (${connectScreens.steps.length} steps)`);

  console.log('\n🎉 Journey Templates seeded successfully!');
  console.log(`Total templates: 3`);
  console.log(`Total steps: ${launchStore.steps.length + weekendPromo.steps.length + connectScreens.steps.length}`);
}

seedJourneys()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

