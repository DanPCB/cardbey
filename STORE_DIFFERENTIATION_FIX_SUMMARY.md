# Store Differentiation Fix - Implementation Summary

## Goal
Fix the "same outcomes for totally different inputs" problem for image suggestion and seed catalog by ensuring StoreIntent drives generation from the first step.

## Root Issue Hypothesis
- StoreIntent was missing/not applied early, so seed products + image queries used generic templates & generic queries
- Pipeline was falling back silently to default templates or cached results

## Implementation

### 1. Strong StoreIntent Object with Domain Detection ✅

**File:** `apps/core/cardbey-core/src/mi/contentBrain/types.ts`
- Added `domain` field to `StoreIntent`: 'food', 'retail', 'florist', 'service', 'general'
- Added `style` field (array of style keywords)
- Added `confidence` field (0-1)

**File:** `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`
- Enhanced `inferStoreIntent()` to detect domain:
  - Mexican restaurant: `domain='food'`, `cuisine='mexican'`
  - Chinese restaurant: `domain='food'`, `cuisine='chinese'`
  - Florist: `domain='florist'`
  - Shoe store: `domain='retail'`
- Added Mexican restaurant detection (was missing)
- Improved avoidKeywords for each domain

**File:** `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts`
- `plan_store` stage MUST output `storeIntent` with domain, cuisine, keywords, avoidKeywords, confidence
- Added logging: `[PLAN_STORE][STORE_INTENT]` with domain
- Added warning: `[STORE_INTENT_FALLBACK]` when confidence < 0.6

### 2. Eliminate Silent Fallbacks ✅

**File:** `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts`
- Logs `[STORE_INTENT_FALLBACK]` when confidence < 0.6 with reasons

**File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
- Logs `[SEED_CATALOG][TEMPLATE_FALLBACK]` when using default template
- Logs `[SEED_CATALOG][TEMPLATE_SELECTION]` when selecting cuisine-specific template
- Logs `[SEED_CATALOG][IMAGE_QUERY]` with cuisine/domain context

### 3. Store-Specific Query Generation ✅

**File:** `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`
- For restaurants: cuisine keywords MUST appear in queries ("mexican tacos", "chinese dumplings")
- For florist: queries like "bouquet", "flower arrangement", "wedding flowers"
- For shoes store: queries like "sneakers", "leather shoes", "running shoes", "shoe store"
- Added `[IMAGE_QUERY]` log with cuisine/domain

**File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
- Seed catalog queries now use StoreIntent keywords
- Mexican: "Tacos al pastor mexican street food close up"
- Chinese: "Dumplings chinese noodles wok"
- Florist: "bouquet flower arrangement wedding flowers"
- Shoes: "sneakers running shoes shoe store product photography"

### 4. Cache Key Hygiene ✅

**Status:** No caching found that needs fixing. All queries are keyed by jobId/generationRunId.

### 5. Make Mismatches Impossible ✅

**File:** `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.ts`
- Added domain-level penalty:
  - If `storeIntent.domain='florist'` then candidates with food keywords get -0.6 penalty
  - If `storeIntent.domain='food'` then candidates with office/real-estate/people-corporate get -0.6 penalty
  - If `storeIntent.domain='retail'` then candidates with dining/menus get -0.6 penalty
- Added storeIntent keywords boost: +0.15 per match (up to 3 matches)
- Minimum score threshold: If all candidates < 0.4, run revised query with stronger storeIntent keywords

**File:** `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`
- Added Step 7.5: Minimum score threshold check
- If topScore < 0.4, runs revised query with stronger storeIntent keywords
- Logs: `[IMAGE_SUGGEST][LOW_SCORES]`, `[IMAGE_SUGGEST][REVISED_QUERY_SUCCESS]`

### 6. Acceptance Test ✅

**File:** `apps/core/cardbey-core/test-store-differentiation.sh`
- Tests 3 stores: Chinese restaurant, Mexican restaurant, Florist
- Verifies different product names and image queries
- Checks backend logs for StoreIntent, template selection, image queries

## Key Changes

### StoreIntent Enhancement
- Added `domain` field for high-level categorization
- Added `style` field for style keywords
- Added `confidence` field for quality tracking
- Enhanced Mexican restaurant detection

### Query Generation
- Cuisine keywords MUST appear in restaurant queries
- Domain-specific query patterns for florist/shoes
- StoreIntent keywords prioritized over generic terms

### Scoring Improvements
- Domain-level mismatch penalties (-0.6 for wrong domain)
- StoreIntent keyword boost (+0.15 per match)
- Minimum score threshold with revised query fallback

### Logging
- `[STORE_INTENT_FALLBACK]` - Low confidence warnings
- `[SEED_CATALOG][TEMPLATE_FALLBACK]` - Default template warnings
- `[SEED_CATALOG][TEMPLATE_SELECTION]` - Cuisine-specific template selection
- `[IMAGE_QUERY]` - Query with cuisine/domain context
- `[IMAGE_SUGGEST][LOW_SCORES]` - Low score warnings
- `[IMAGE_SUGGEST][REVISED_QUERY_SUCCESS]` - Revised query success

## Expected Outcomes

### Chinese Restaurant
- Products: Dumplings, Kung Pao Chicken, Beef Noodles (NOT tacos/burritos)
- Image queries: Include "chinese", "dumplings", "noodles"
- Avoid: pizza, pasta, taco, burrito

### Mexican Restaurant
- Products: Tacos, Burritos, Quesadillas (NOT dumplings/kung pao)
- Image queries: Include "mexican", "taco", "burrito"
- Avoid: dumplings, kung pao, hot pot, ramen

### Florist
- Products: Bouquet of Roses, Wedding Arrangement (NOT food)
- Image queries: Include "bouquet", "flower arrangement"
- Avoid: food, restaurant, dining, pizza, taco

## Files Changed

1. `apps/core/cardbey-core/src/mi/contentBrain/types.ts` - Added domain, style, confidence
2. `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts` - Enhanced domain detection
3. `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts` - StoreIntent output + logging
4. `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts` - Template selection + query generation
5. `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts` - Query generation + revised query fallback
6. `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.ts` - Domain penalties + keyword boost
7. `apps/core/cardbey-core/test-store-differentiation.sh` - Acceptance test script

## Verification

Run the acceptance test:
```bash
cd apps/core/cardbey-core
chmod +x test-store-differentiation.sh
./test-store-differentiation.sh
```

Check backend logs for:
- `[STORE_CONTEXT][SAVED]` - Should show cuisine/domain for each store
- `[PLAN_STORE][STORE_INTENT]` - Should show cuisine=chinese/mexican, domain=florist
- `[SEED_CATALOG][TEMPLATE_SELECTION]` - Should show mexican_restaurant/chinese_restaurant/florist
- `[SEED_CATALOG][IMAGE_QUERY]` - Should show cuisine/domain in queries
- `[IMAGE_QUERY]` - Should show cuisine/domain in product image queries




