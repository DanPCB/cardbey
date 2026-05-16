import { publishDraft } from '../src/services/draftStore/publishDraftService.js';
import { toPublicStore } from '../src/utils/publicStoreMapper.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Prisma client is generated to node_modules/.prisma/client-gen (see prisma/sqlite/schema.prisma).
  const prismaModPath = path.resolve(__dirname, '..', 'node_modules', '.prisma', 'client-gen', 'index.js');
  const prismaMod = await import(pathToFileURL(prismaModPath).href);
  const PrismaClient = prismaMod.PrismaClient;
  if (!PrismaClient) throw new Error('PrismaClient not found at client-gen output');

  const prisma = new PrismaClient();
  try {
    const drafts = await prisma.draftStore.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        ownerUserId: true,
        preview: true,
        committedStoreId: true,
      },
    });

    const candidates = drafts
      .map((d) => {
        const raw = d.preview && typeof d.preview === 'object' ? d.preview : null;
        const sp = raw && typeof raw.stylePreferences === 'object' && raw.stylePreferences ? raw.stylePreferences : null;
        const miniFromSp = sp && typeof sp.miniWebsite === 'object' && sp.miniWebsite ? sp.miniWebsite : null;
        const miniFromWebsite = raw && typeof raw.website === 'object' && raw.website ? raw.website : null;
        const mini = miniFromSp ?? miniFromWebsite;
        const hasMini =
          !!mini &&
          (Array.isArray(mini.sections) ? mini.sections.length > 0 : false || mini.theme != null);
        return { ...d, hasMini };
      })
      .filter((d) => d.hasMini && typeof d.ownerUserId === 'string' && d.ownerUserId.trim());

    const pick = candidates[0];
    if (!pick) {
      console.error('No recent draftStore with miniWebsite + ownerUserId found in last 50 drafts.');
      console.error(
        drafts.slice(0, 10).map((d) => ({
          id: d.id,
          status: d.status,
          ownerUserId: d.ownerUserId,
          committedStoreId: d.committedStoreId,
        }))
      );
      process.exitCode = 1;
      return;
    }

    console.log('[smoke] picked draft', {
      draftId: pick.id,
      status: pick.status,
      ownerUserId: pick.ownerUserId,
      committedStoreId: pick.committedStoreId,
      updatedAt: pick.updatedAt,
    });

    const result = await publishDraft(prisma, {
      storeId: 'temp',
      draftId: pick.id,
      userId: pick.ownerUserId,
    });

    console.log('[smoke] publishDraft result', result);

    const business = await prisma.business.findUnique({
      where: { id: result.storeId },
      include: { products: { where: { isPublished: true } } },
    });
    if (!business) throw new Error('published business not found');

    const prefs = business.stylePreferences && typeof business.stylePreferences === 'object' ? business.stylePreferences : {};
    const hasMiniPrefs = !!(prefs && typeof prefs === 'object' && prefs.miniWebsite);
    const publicDto = toPublicStore(business);
    const hasWebsiteProjection = !!(publicDto?.website && Array.isArray(publicDto.website.sections) && publicDto.website.sections.length > 0);

    console.log('[smoke] business.stylePreferences.miniWebsite', hasMiniPrefs ? 'present' : 'missing');
    console.log('[smoke] publicDto.website', hasWebsiteProjection ? 'present' : 'missing');
    console.log('[smoke] slug', publicDto.slug);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[smoke] failed', e);
  process.exitCode = 1;
});

