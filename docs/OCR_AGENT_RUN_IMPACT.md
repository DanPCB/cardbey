# OCR Agent Run – Impact Assessment

## Change
- Added `agentKey="ocr"` and OCR executor in the mission run flow.
- Dispatch accepts `targetAgent: "ocr"`; executor resolves image from trigger/adjacent messages, runs existing OCR, posts research_result, merges `businessProfile` into mission context.

## Store-creation OCR (unchanged)
- **performMenuOcr**, **parseOcrToEntities**, **buildSummaryAndBullets** are reused as-is. No changes to:
  - `draftStoreService.js` (store creation photo OCR)
  - `buildCatalog.js` (catalog OCR)
  - `ai.js` (DALL-E / image OCR)
  - `agentChatRoutes.js` (POST /agent-chat/attachments/ocr)
- OCR executor only **calls** the same modules with the same input shape (data URL or image URL resolved to data URL). No new code paths inside the OCR module.

## Additive only
- New branch in `agentRunExecutor.js` when `agentKey === 'ocr'`.
- New allowed value in `missionsRoutes.js` for `targetAgent`.
- Dashboard: new "OCR (extract text)" option and dispatch after send when that option is selected.

## Manual test
1. Open Agent Chat, select **OCR (extract text)** in the dropdown.
2. Upload a business card image and send (with or without text).
3. Expect: "Run started: ocr" system message, then "Image summary (OCR)" research_result with extracted entities and raw text in Details; mission context updated with `businessProfile`.
