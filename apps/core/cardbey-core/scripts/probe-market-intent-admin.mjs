/**
 * Full admin G1→G4 probe with real semantic extraction (dev only).
 */
import '../src/env/loadEnv.js';
import { analyzeMarketIntentForAdmin } from '../src/lib/marketIntent/admin/marketIntentAdminService.ts';

const modernSecurityDoors = `MODERN SECURITY DOORS

We measure, supply, and install Roller Shutters — all you have to do is enjoy the result.

Roller Shutter Installation | Repair | Upgrade from manual to motorized with remote

DM us for a free measure & quote
Phone: 0410896889
Victoria - Melbourne - Australia`;

const vietnameseCase =
  'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.';

for (const [name, rawText] of [
  ['case1_vietnamese', vietnameseCase],
  ['case2_modern_security_doors', modernSecurityDoors],
]) {
  const start = Date.now();
  const result = await analyzeMarketIntentForAdmin({
    rawText,
    sourceType: 'social_post',
    permitted: true,
    skipNetwork: true,
  });
  console.log(
    JSON.stringify(
      {
        case: name,
        status: result.status,
        analysisStatus: result.analysisStatus,
        semanticStatus: result.semanticStatus,
        classification: result.analysis?.classification,
        primaryIntent: result.analysis?.intents?.primary,
        has: result.analysis?.has?.map((h) => h.label),
        wants: result.analysis?.wants?.map((w) => w.label),
        g2Outcome: result.g2Outcome,
        entityKind: result.resolvedEntity?.entityKind,
        resolutionStatus: result.resolvedEntity?.resolutionStatus,
        displayName: result.resolvedEntity?.displayName,
        fit: result.opportunityAssessment?.overallFitBand,
        fitScore: result.opportunityAssessment?.overallScore,
        g4Title: result.brief?.opportunityCard?.title,
        timingsMs: result.timingsMs,
        totalMs: Date.now() - start,
      },
      null,
      2,
    ),
  );
}
