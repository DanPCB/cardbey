/**
 * Seed Trend Profiles for AI Design Assistant
 * 
 * Run with: node prisma/seed.trends.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTrends() {
  console.log('🌱 Seeding trend profiles...');

  const trends = [
    {
      slug: "2025-q1-neon-tech-poster",
      name: "Neon Tech 2025 Poster",
      season: "2025-Q1",
      domain: "design",
      goal: "poster",
      source: "manual",
      isActive: true,
      weight: 1,
      data: {
        palettes: [
          { name: "Neon Cyber", colors: ["#00F6FF", "#FF00FF", "#050816"] }
        ],
        typography: {
          headline: { families: ["Space Grotesk", "Archivo"], weight: "700" },
          body: { families: ["Inter"], weight: "400" }
        },
        layout_patterns: [
          "hero_subject_right_big_headline_left",
          "full_bleed_bg_with_centered_type"
        ],
        prompt_tags: ["futuristic", "neon", "hi-tech", "grid_background"]
      }
    },
    {
      slug: "2025-q1-warm-bakery",
      name: "Warm Bakery 2025",
      season: "2025-Q1",
      domain: "design",
      goal: "poster",
      source: "manual",
      isActive: true,
      weight: 1,
      data: {
        palettes: [
          { name: "Warm Comfort", colors: ["#F4A261", "#E76F51", "#FEF3E2", "#8B4513"] }
        ],
        typography: {
          headline: { families: ["Playfair Display", "Merriweather"], weight: "700" },
          body: { families: ["Lato", "Open Sans"], weight: "400" }
        },
        layout_patterns: [
          "centered_food_hero_with_text_overlay",
          "split_screen_food_left_text_right"
        ],
        prompt_tags: ["warm", "cozy", "artisanal", "handcrafted", "food_photography"]
      }
    },
    {
      slug: "2025-q1-minimal-corporate",
      name: "Minimal Corporate 2025",
      season: "2025-Q1",
      domain: "design",
      goal: "poster",
      source: "manual",
      isActive: true,
      weight: 1,
      data: {
        palettes: [
          { name: "Corporate Blue", colors: ["#1E3A8A", "#3B82F6", "#F8FAFC", "#0F172A"] }
        ],
        typography: {
          headline: { families: ["Inter", "Roboto"], weight: "600" },
          body: { families: ["Inter", "Roboto"], weight: "400" }
        },
        layout_patterns: [
          "clean_grid_with_white_space",
          "minimal_centered_content"
        ],
        prompt_tags: ["professional", "clean", "minimalist", "corporate", "trustworthy"]
      }
    },
    {
      slug: "2025-q1-playful-social",
      name: "Playful Social 2025",
      season: "2025-Q1",
      domain: "design",
      goal: "poster",
      source: "manual",
      isActive: true,
      weight: 1,
      data: {
        palettes: [
          { name: "Vibrant Playful", colors: ["#FF6B6B", "#4ECDC4", "#FFE66D", "#95E1D3"] }
        ],
        typography: {
          headline: { families: ["Poppins", "Montserrat"], weight: "700" },
          body: { families: ["Poppins", "Nunito"], weight: "400" }
        },
        layout_patterns: [
          "bold_centered_graphics_with_playful_text",
          "asymmetric_layout_with_color_blocks"
        ],
        prompt_tags: ["playful", "colorful", "energetic", "fun", "youthful"]
      }
    }
  ];

  let created = 0;
  let skipped = 0;

  for (const trendData of trends) {
    const existing = await prisma.trendProfile.findUnique({
      where: { slug: trendData.slug }
    });

    if (existing) {
      console.log(`⏭️  Trend "${trendData.name}" already exists (slug: ${trendData.slug})`);
      skipped++;
      continue;
    }

    const trend = await prisma.trendProfile.create({
      data: trendData
    });

    console.log(`✅ Created trend: ${trend.name} (${trend.slug})`);
    created++;
  }

  console.log(`\n✅ Seeding complete! Created: ${created}, Skipped: ${skipped}`);
}

async function main() {
  try {
    await seedTrends();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

