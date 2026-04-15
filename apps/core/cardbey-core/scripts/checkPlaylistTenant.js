/**
 * Quick script to check playlist tenant/store and list playlists
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const playlistId = process.argv[2];
  
  if (playlistId) {
    // Check specific playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        name: true,
        type: true,
        tenantId: true,
        storeId: true,
        _count: {
          select: { items: true }
        }
      }
    });
    
    if (playlist) {
      console.log('Playlist:', playlist);
      console.log(`\nTo access this playlist, use:`);
      console.log(`tenantId=${playlist.tenantId}&storeId=${playlist.storeId}`);
    } else {
      console.log('Playlist not found');
    }
  } else {
    // List all SIGNAGE playlists
    const playlists = await prisma.playlist.findMany({
      where: { type: 'SIGNAGE' },
      select: {
        id: true,
        name: true,
        tenantId: true,
        storeId: true,
        _count: {
          select: { items: true }
        }
      },
      take: 20
    });
    
    console.log(`Found ${playlists.length} SIGNAGE playlists:\n`);
    playlists.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(`  Name: ${p.name || '(unnamed)'}`);
      console.log(`  Tenant: ${p.tenantId || 'null'}`);
      console.log(`  Store: ${p.storeId || 'null'}`);
      console.log(`  Items: ${p._count.items}`);
      console.log(`  URL: /api/signage/playlist/${p.id}?tenantId=${p.tenantId || ''}&storeId=${p.storeId || ''}`);
      console.log('');
    });
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
