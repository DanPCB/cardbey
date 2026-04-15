// scripts/diagnose-playlists.js
// Diagnostic script to check all playlists and their items

import { PrismaClient } from '@prisma/client';
import { fileExistsOnDisk } from '../src/utils/publicUrl.js';

const prisma = new PrismaClient();

async function diagnosePlaylists() {
  console.log('\n=== Playlist Diagnosis ===\n');
  
  try {
    // Get all playlists
    const playlists = await prisma.playlist.findMany({
      include: {
        items: {
          include: { media: true },
          orderBy: { orderIndex: 'asc' },
        },
        screens: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    
    console.log(`Total playlists: ${playlists.length}\n`);
    
    for (const playlist of playlists) {
      console.log(`\n📋 Playlist: "${playlist.name}" (ID: ${playlist.id})`);
      console.log(`   Items: ${playlist.items.length}`);
      console.log(`   Assigned to screens: ${playlist.screens.length}`);
      
      if (playlist.items.length === 0) {
        console.log('   ⚠️  Empty playlist');
        continue;
      }
      
      let playableCount = 0;
      let missingCount = 0;
      
      for (const item of playlist.items) {
        const media = item.media || {};
        const mediaUrl = media.url || '';
        
        // Check DB flag
        const dbFlagMissing = media.missingFile === true;
        
        // Check file existence
        let fileExists = false;
        if (mediaUrl) {
          fileExists = fileExistsOnDisk(mediaUrl);
          
          // Also check optimized URL for videos
          if (media.kind === 'VIDEO' && media.optimizedUrl) {
            const optimizedExists = fileExistsOnDisk(media.optimizedUrl);
            if (optimizedExists) {
              fileExists = true;
            }
          }
        }
        
        const status = dbFlagMissing && !fileExists ? 'MISSING (DB+FS)' :
                      dbFlagMissing && fileExists ? 'EXISTS (DB flag wrong)' :
                      !dbFlagMissing && !fileExists ? 'MISSING (FS only)' :
                      'OK';
        
        if (status === 'OK' || status === 'EXISTS (DB flag wrong)') {
          playableCount++;
        } else {
          missingCount++;
        }
        
        console.log(`   ${status === 'OK' ? '✅' : '❌'} Item ${item.orderIndex}: ${media.kind} - ${mediaUrl}`);
        if (status !== 'OK') {
          console.log(`      Media ID: ${media.id}`);
          console.log(`      DB flag: ${dbFlagMissing ? 'missingFile=true' : 'missingFile=false'}`);
          console.log(`      File exists: ${fileExists}`);
        }
      }
      
      console.log(`   📊 Summary: ${playableCount} playable, ${missingCount} missing`);
      
      if (playableCount === 0 && playlist.items.length > 0) {
        console.log(`   ⚠️  WARNING: All items are missing - playlist is unplayable`);
      }
    }
    
    // Check screens and their assigned playlists
    console.log('\n\n=== Screen Assignments ===\n');
    const screens = await prisma.screen.findMany({
      where: { deletedAt: null },
      include: {
        assignedPlaylist: {
          include: {
            items: {
              include: { media: true },
            },
          },
        },
      },
    });
    
    for (const screen of screens) {
      console.log(`\n📺 Screen: "${screen.name || screen.id}" (${screen.id})`);
      if (screen.assignedPlaylist) {
        const playlist = screen.assignedPlaylist;
        const totalItems = playlist.items.length;
        const playableItems = playlist.items.filter(item => {
          const media = item.media || {};
          if (media.missingFile === true) {
            // Re-check file existence
            return fileExistsOnDisk(media.url);
          }
          return true;
        }).length;
        
        console.log(`   Playlist: "${playlist.name}" (${playlist.id})`);
        console.log(`   Items: ${totalItems} total, ${playableItems} playable`);
        
        if (playableItems === 0 && totalItems > 0) {
          console.log(`   ⚠️  WARNING: No playable items - screen will show empty playlist`);
        }
      } else {
        console.log(`   No playlist assigned`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

diagnosePlaylists()
  .then(() => {
    console.log('\n✅ Diagnosis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnosis failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

