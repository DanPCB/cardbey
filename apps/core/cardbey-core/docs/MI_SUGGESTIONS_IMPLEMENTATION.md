# MI Suggestions Implementation

## Overview

Implemented MI (Merged Intelligence) suggestions for Signage playlists, providing AI-powered recommendations to improve playlist effectiveness.

## Part 1: Creative Engine UI Wiring

### Status: ✅ Already Complete

The Creative Engine UI was already properly wired:
- **Content Loading**: `CreativeEngineShellPage` loads contents via `listDesigns()` from `/api/contents`
- **Content List**: `DesignLibrary` component displays contents with MI badges
- **MI Panel**: `MIInspectorPanel` shows MI data for selected content
- **Selection**: Clicking a content updates `selectedContent` state and MI panel

**Files:**
- `src/pages/CreativeEngineShellPage.tsx` - Main page with content list and MI panel
- `src/features/contents-studio/components/DesignLibrary.tsx` - Content list with MI badges
- `src/features/contents-studio/api/contents.ts` - API client with MIEntity support

## Part 2: MI Suggestions for Playlists

### Backend Implementation

#### 1. MI Orchestrator Service

**File:** `src/services/miOrchestratorService.ts`

**Function:** `getSignagePlaylistSuggestions()`

**Heuristics Implemented:**
1. **Attractor Duration Check**: Items with `attract_attention_to_promo` intent but duration < 5s get recommendation to increase to 6-8s
2. **Missing Role Warning**: Items with MIEntity but no role set
3. **Missing MIEntity Info**: Items without MIEntity at all
4. **Single Item Playlist**: Playlists with only one item get info suggestion
5. **Long Playlist**: Playlists with > 20 items get info suggestion about potential fatigue

**Suggestion Types:**
- `info` - Informational messages (blue/gray)
- `warning` - Issues that should be addressed (amber/yellow)
- `recommendation` - Best practice suggestions (emerald/green)

#### 2. MI Routes

**File:** `src/routes/miRoutes.js`

**Endpoint:** `GET /api/mi/orchestrator/signage-playlists/:playlistId/suggestions`

**Query Parameters:**
- `tenantId` - Tenant ID (required)
- `storeId` - Store ID (optional)

**Response:**
```json
{
  "ok": true,
  "suggestions": [
    {
      "type": "recommendation",
      "code": "increase_duration_for_attractor",
      "message": "Item #1 is an attractor promo but displays for only 4s...",
      "itemId": "item-id-here"
    }
  ]
}
```

**Mounted in:** `src/server.js` at `/api/mi`

### Frontend Implementation

#### 1. API Client Function

**File:** `src/lib/api.ts`

**Function:** `getMISuggestionsForSignagePlaylist(playlistId, storeId?, tenantId?)`

**Type:** `MISuggestion`

#### 2. Playlist Editor UI

**File:** `src/pages/signage/PlaylistEditorPage.jsx`

**Features:**
- **"MI Suggestions" Button** in header
- **Loading State** with spinner
- **Suggestions Panel** appears below header when suggestions are loaded
- **Color-coded Suggestions**:
  - Info: Gray/blue background
  - Warning: Amber/yellow background
  - Recommendation: Emerald/green background
- **Error Handling** displays error message if loading fails

**State Management:**
- `miSuggestions` - Array of suggestions
- `isLoadingMISuggestions` - Loading state
- `miSuggestionsError` - Error message

## Usage

### Backend

1. Start backend server
2. Endpoint available at: `GET /api/mi/orchestrator/signage-playlists/:playlistId/suggestions`

### Frontend

1. Open Signage → Playlist Editor
2. Click "MI Suggestions" button in header
3. Suggestions panel appears below header with color-coded recommendations
4. Click button again to refresh suggestions

## Example Suggestions

1. **Recommendation:**
   - "Item #1 is an attractor promo but displays for only 4s. Consider increasing to at least 6–8 seconds."

2. **Warning:**
   - "Item #2 has MIEntity but no role set. Assign a role to improve MI behavior."

3. **Info:**
   - "This playlist contains only one item. Consider adding at least one more variation to avoid fatigue."
   - "No obvious MI issues detected for this playlist."

## Files Created/Modified

### Created
- `apps/core/cardbey-core/src/services/miOrchestratorService.ts` - MI orchestrator service
- `apps/core/cardbey-core/src/routes/miRoutes.js` - MI routes
- `apps/core/cardbey-core/docs/MI_SUGGESTIONS_IMPLEMENTATION.md` - This document

### Modified
- `apps/core/cardbey-core/src/server.js` - Mounted MI routes
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Added `getMISuggestionsForSignagePlaylist()`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/PlaylistEditorPage.jsx` - Added MI suggestions UI

## Future Enhancements

1. **More Heuristics:**
   - Check for optimal item ordering
   - Detect content variety issues
   - Suggest content types based on time of day
   - Analyze content duration distribution

2. **Actionable Suggestions:**
   - "Apply" button to auto-fix issues
   - Direct links to edit items
   - Bulk operations

3. **Analytics Integration:**
   - Use actual performance data to suggest improvements
   - A/B test recommendations
   - Track suggestion effectiveness

4. **Real-time Updates:**
   - Auto-refresh suggestions when playlist changes
   - WebSocket updates for collaborative editing

## Testing

1. **Backend:**
   ```bash
   # Test endpoint
   curl -H "Authorization: Bearer dev-admin-token" \
     "http://localhost:3001/api/mi/orchestrator/signage-playlists/{playlistId}/suggestions?tenantId={tenantId}"
   ```

2. **Frontend:**
   - Open playlist editor
   - Click "MI Suggestions"
   - Verify suggestions appear
   - Check color coding
   - Test error handling (invalid playlist ID)

## Notes

- Suggestions are non-blocking - playlist operations continue even if suggestions fail
- Suggestions are computed on-demand (not cached)
- All heuristics are basic rules - can be enhanced with ML/AI in future
- Suggestions respect tenant/store context for multi-tenant scenarios

