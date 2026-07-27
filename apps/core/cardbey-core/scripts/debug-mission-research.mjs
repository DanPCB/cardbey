import { getPrismaClient } from '../src/lib/prisma.js';

const mid = process.argv[2] || 'cmr9l6xyo000vjv9cd4vp8ftq';
const prisma = getPrismaClient();

const mission = await prisma.mission.findUnique({
  where: { id: mid },
  select: { id: true, status: true, context: true },
});
console.log('=== MISSION ===');
console.log(JSON.stringify(mission, null, 2)?.slice(0, 12000));

const ctx = mission?.context && typeof mission.context === 'object' ? mission.context : {};
const draftId = ctx.draftId || ctx.entities?.draftId;
if (draftId) {
  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { id: true, input: true, preview: true },
  });
  const pv = draft?.preview && typeof draft.preview === 'object' ? draft.preview : {};
  const items = Array.isArray(pv.items) ? pv.items : [];
  console.log('=== DRAFT', draftId, '===');
  console.log('catalogSource', pv.meta?.catalogSource);
  console.log('itemCount', items.length);
  console.log('firstItems', items.slice(0, 6).map((i) => ({ name: i?.name, price: i?.price })));
}

const recent = await prisma.draftStore.findMany({
  orderBy: { updatedAt: 'desc' },
  take: 10,
  select: { id: true, input: true, preview: true, updatedAt: true },
});
for (const d of recent) {
  const inp = d.input && typeof d.input === 'object' ? d.input : {};
  const blob = JSON.stringify(inp);
  if (blob.includes(mid)) {
    const pv = d.preview && typeof d.preview === 'object' ? d.preview : {};
    const items = Array.isArray(pv.items) ? pv.items : [];
    console.log('=== MATCHED DRAFT', d.id, '===');
    console.log('catalogSource', pv.meta?.catalogSource);
    console.log('itemCount', items.length);
    console.log('firstItems', items.slice(0, 6).map((i) => ({ name: i?.name, price: i?.price })));
    console.log('input', JSON.stringify(inp).slice(0, 800));
  }
}

await prisma.$disconnect();
