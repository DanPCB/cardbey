/**
 * Seed Cardbey Audio Library — search open sources and import initial tracks.
 *
 * Usage: npm run seed:audio
 */

import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '../src/lib/prismaClient.js';
import { audioService } from '../src/lib/audio/audioService.js';

const prisma = new PrismaClient();

const SEED_QUERIES = [
  { query: 'cafe ambient background', source: 'jamendo', limit: 5 },
  { query: 'upbeat chill cafe', source: 'openverse', limit: 5 },
  { query: 'restaurant atmosphere', source: 'freesound', limit: 3 },
  { query: 'lofi background music', source: 'ccmixter', limit: 3 },
];

async function seedAudioLibrary() {
  console.log('🎵 Seeding Cardbey Audio Library...');

  let saved = 0;
  let skipped = 0;

  for (const seed of SEED_QUERIES) {
    console.log(`\n🔍 Searching ${seed.source}: "${seed.query}"`);
    try {
      const { results } = await audioService.search(seed.query, seed.source, seed.limit);
      for (const track of results.slice(0, seed.limit)) {
        try {
          const existing = await prisma.audioLibrary.findUnique({
            where: { externalId: track.id },
          });
          if (existing?.storageUrl) {
            console.log(`  ⏭️  Already saved: ${track.title}`);
            skipped += 1;
            continue;
          }

          console.log(`  ⬇️  Importing: ${track.title} (${track.source})`);
          await audioService.saveAudioToLibrary(track, { isSeeded: true });
          console.log(`  ✅ Saved: ${track.title}`);
          saved += 1;
        } catch (err) {
          console.error(`  ❌ Failed ${track.title}:`, err?.message || err);
        }
      }
    } catch (err) {
      console.error(`  ❌ Search failed for ${seed.source}:`, err?.message || err);
    }
  }

  console.log(`\n🎵 Done — ${saved} imported, ${skipped} skipped.`);
}

seedAudioLibrary()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
