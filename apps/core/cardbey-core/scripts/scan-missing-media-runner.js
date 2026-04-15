// scripts/scan-missing-media-runner.js
// Exportable scanner function for use in admin endpoints

import { PrismaClient } from '@prisma/client';
import { fileExistsOnDisk } from '../src/utils/publicUrl.js';

const prisma = new PrismaClient();

/**
 * Check if a media file exists on disk
 * For videos, checks both optimized and original files
 */
function checkMediaFileExists(media) {
  const { url, optimizedUrl, kind } = media;
  
  // For videos, prefer checking optimized file first, then original
  if (kind === 'VIDEO' && optimizedUrl) {
    // Check if optimized file exists
    if (fileExistsOnDisk(optimizedUrl)) {
      return { exists: true, checkedPath: optimizedUrl };
    }
    // Fallback to original if optimized is missing
    if (fileExistsOnDisk(url)) {
      return { exists: true, checkedPath: url, optimizedMissing: true };
    }
    // Both missing
    return { exists: false, checkedPath: url, optimizedPath: optimizedUrl };
  }
  
  // For images or videos without optimized version, check original
  return {
    exists: fileExistsOnDisk(url),
    checkedPath: url,
  };
}

/**
 * Main scanner function - exported for use in admin endpoints
 */
export async function scanMissingMedia() {
  const startTime = Date.now();
  const pageSize = 200;
  let skip = 0;
  let totalChecked = 0;
  let markedMissing = 0;
  let clearedMissing = 0;
  let optimizedCleared = 0;
  
  try {
    // First, count total media records
    const totalCount = await prisma.media.count();
    
    // Process in batches
    while (true) {
      const mediaBatch = await prisma.media.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'asc' },
      });
      
      if (mediaBatch.length === 0) {
        break;
      }
      
      // Process each media item
      for (const media of mediaBatch) {
        totalChecked++;
        
        const fileCheck = checkMediaFileExists(media);
        
        // Handle missing files
        if (!fileCheck.exists) {
          if (!media.missingFile) {
            // Mark as missing
            await prisma.media.update({
              where: { id: media.id },
              data: { missingFile: true },
            });
            markedMissing++;
            
            // If optimized URL exists but file is missing, clear it
            if (fileCheck.optimizedPath && media.optimizedUrl) {
              await prisma.media.update({
                where: { id: media.id },
                data: { optimizedUrl: null },
              });
              optimizedCleared++;
            }
          }
        } else {
          // File exists - clear missing flag if it was set
          if (media.missingFile) {
            await prisma.media.update({
              where: { id: media.id },
              data: { missingFile: false },
            });
            clearedMissing++;
          }
          
          // If optimized file is missing but original exists, clear optimizedUrl
          if (fileCheck.optimizedMissing && media.optimizedUrl) {
            await prisma.media.update({
              where: { id: media.id },
              data: { optimizedUrl: null },
            });
            optimizedCleared++;
          }
        }
      }
      
      skip += pageSize;
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Get current missing count
    const missingCount = await prisma.media.count({
      where: { missingFile: true },
    });
    
    return {
      totalChecked,
      markedMissing,
      clearedMissing,
      optimizedCleared,
      duration: parseFloat(duration),
      currentMissingCount: missingCount,
    };
  } catch (error) {
    throw error;
  } finally {
    // Don't disconnect - let the caller manage the connection
  }
}

