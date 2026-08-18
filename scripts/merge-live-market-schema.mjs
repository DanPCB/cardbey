import fs from 'node:fs';
import path from 'node:path';

const dirtyRoot = 'C:/Projects/cardbey/apps/core/cardbey-core';
const wtRoot = 'C:/Projects/cardbey-wt-live-core/apps/core/cardbey-core';

const RELS = [
  'prisma/sqlite/schema.prisma',
  'prisma/postgres/schema.prisma',
  'prisma/schema.prisma',
];

function ensureUserRelations(schema) {
  if (schema.includes('liveMarketParticipantRegistrations')) return schema;
  const insert = '\n  liveMarketParticipantRegistrations LiveMarketParticipantRegistration[]';
  const anchors = [
    'conversationSessions       ConversationSession[]',
    'suitcaseItems              SuitcaseItem[]',
    'userAccountEvents          UserAccountEvent[] @relation("UserAccountEventSubject")',
  ];
  for (const a of anchors) {
    if (schema.includes(a)) return schema.replace(a, a + insert);
  }
  throw new Error('Could not find User relation anchor');
}

function ensureBusinessRelations(schema) {
  if (schema.includes('liveMarketPilotEnrollment')) return schema;
  const insert =
    '\n  liveMarketPilotEnrollment LiveMarketPilotEnrollment?\n  liveMarketSessions        LiveMarketSession[]\n  liveMarketParticipantRegistrations LiveMarketParticipantRegistration[]';
  const anchors = [
    'offerClaims             OfferClaim[]',
    'storeShares             StoreShare[]',
    'storeSaves              StoreSave[]',
  ];
  for (const a of anchors) {
    if (schema.includes(a)) return schema.replace(a, a + insert);
  }
  throw new Error('Could not find Business relation anchor');
}

function appendModels(schema, dirty) {
  if (schema.includes('model LiveMarketPilotEnrollment')) return schema;
  const start = dirty.indexOf('/// Cardbey Live Market — pilot enrolment');
  const alt = dirty.indexOf('model LiveMarketPilotEnrollment');
  const from = start >= 0 ? start : alt;
  if (from < 0) throw new Error('Live Market models missing in dirty schema');
  const chunk = dirty.slice(from);
  const gStart = chunk.indexOf('model GlobalLiveEoiRegistration');
  if (gStart < 0) throw new Error('GlobalLiveEoiRegistration missing');
  const afterG = chunk.indexOf('\nmodel ', gStart + 1);
  const models = (afterG > 0 ? chunk.slice(0, afterG) : chunk).trimEnd();
  return `${schema.trimEnd()}\n\n${models}\n`;
}

for (const rel of RELS) {
  const dirtyPath = path.join(dirtyRoot, rel);
  const wtPath = path.join(wtRoot, rel);
  if (!fs.existsSync(wtPath)) {
    console.log(JSON.stringify({ rel, skipped: true, reason: 'missing wt' }));
    continue;
  }
  if (!fs.existsSync(dirtyPath)) {
    console.log(JSON.stringify({ rel, skipped: true, reason: 'missing dirty' }));
    continue;
  }
  let schema = fs.readFileSync(wtPath, 'utf8');
  const dirty = fs.readFileSync(dirtyPath, 'utf8');
  schema = ensureUserRelations(schema);
  schema = ensureBusinessRelations(schema);
  schema = appendModels(schema, dirty);
  fs.writeFileSync(wtPath, schema);
  console.log(
    JSON.stringify({
      rel,
      hasLive: schema.includes('model LiveMarketPilotEnrollment'),
      hasEoi: schema.includes('model GlobalLiveEoiRegistration'),
      userRel: schema.includes('liveMarketParticipantRegistrations'),
      bizRel: schema.includes('liveMarketPilotEnrollment'),
      bytes: schema.length,
    }),
  );
}
