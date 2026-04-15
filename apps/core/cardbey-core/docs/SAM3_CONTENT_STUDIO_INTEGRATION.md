# SAM-3 Content Studio Integration

## Overview

This document describes the SAM-3 Orchestrator integration for Content Studio, allowing the frontend to send canvas state and user briefs to the backend for AI-powered design improvements.

## Backend Implementation

### Endpoint

**POST** `/api/orchestrator/design-task`

**Authentication:** Required (uses `requireAuth` middleware)

**Location:** `src/orchestrator/api/orchestratorRoutes.js`

### Request Body

```typescript
interface Sam3DesignTaskRequest {
  entryPoint: "content_studio";  // Required, must be "content_studio"
  mode: "new_banner" | "improve_layout" | "fix_copy" | "video_storyboard";  // Required
  target: "image" | "layout" | "video";  // Required
  canvasState?: unknown;      // Optional - current canvas JSON state
  selection?: unknown;        // Optional - selected element(s)
  userPrompt: string;         // Required - user's design request
}
```

### Response

**Success (200):**
```typescript
{
  ok: true,
  taskId: string,  // Task identifier for tracking
  result: {
    updatedCanvas?: unknown;    // New canvas state or patch
    reviewNotes?: string[];     // Review notes and suggestions
    videoStoryboard?: unknown;  // Only when target === "video"
  }
}
```

**Error (400/500):**
```typescript
{
  ok: false,
  error: string,      // Error code
  message: string     // Human-readable error message
}
```

### Validation

The endpoint validates:
- `entryPoint` must be `"content_studio"`
- `mode` must be one of: `"new_banner"`, `"improve_layout"`, `"fix_copy"`, `"video_storyboard"`
- `target` must be one of: `"image"`, `"layout"`, `"video"`
- `userPrompt` must be a non-empty string

### Service Implementation

**Location:** `src/orchestrator/services/sam3DesignTaskService.js`

The service:
1. Logs the incoming request with all parameters
2. Generates a unique task ID
3. Returns mocked data based on the `mode` parameter
4. Includes review notes and suggestions
5. Handles video storyboard generation when `target === "video"`

**Current Status:** Returns mocked data. Ready for SAM-3 orchestrator integration.

### Orchestrator Integration

**Location:** `src/orchestrator/index.js`

The `content_studio` entry point has been added to the unified orchestrator:
- Entry point: `'content_studio'`
- Service: `runSam3DesignTask()`
- Follows the same pattern as other orchestrator services

### TypeScript Types

**Location:** `src/orchestrator/types.ts`

Added interfaces:
- `Sam3DesignTaskRequest` - Request interface
- `Sam3DesignTaskResult` - Result interface
- `Sam3DesignTaskResponse` - Complete response interface

## Example Usage

### Request

```bash
curl -X POST http://localhost:3001/api/orchestrator/design-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "entryPoint": "content_studio",
    "mode": "improve_layout",
    "target": "layout",
    "canvasState": {
      "elements": [
        {
          "id": "text-1",
          "type": "text",
          "text": "Hello World",
          "x": 100,
          "y": 100
        }
      ],
      "settings": {
        "width": 800,
        "height": 600
      }
    },
    "userPrompt": "Make the layout more balanced and add better spacing"
  }'
```

### Response

```json
{
  "ok": true,
  "taskId": "sam3-1701600000000-abc123",
  "result": {
    "updatedCanvas": {
      "elements": [...],
      "settings": {
        "width": 800,
        "height": 600,
        "layout": "improved",
        "spacing": "optimized"
      }
    },
    "reviewNotes": [
      "Improved spacing and alignment",
      "Enhanced visual hierarchy"
    ]
  }
}
```

## Next Steps

### Frontend Integration

The frontend (marketing dashboard) needs to:

1. **Add Art Director Panel Component**
   - Create a new panel/sidebar component in Content Studio
   - Add input field for user prompt
   - Add mode selector (new_banner, improve_layout, fix_copy, video_storyboard)
   - Add target selector (image, layout, video)

2. **Integrate with Canvas State**
   - Access current canvas state from state management (Zustand/Redux)
   - Capture selected elements
   - Serialize canvas state using `serializeCanvas()` from `src/lib/contentStudio.js`

3. **API Client Integration**
   - Add method to API client: `submitDesignTask(request)`
   - Handle loading states
   - Display review notes
   - Apply `updatedCanvas` to canvas state

4. **Apply Results**
   - Use `mergeCanvasUpdates()` from `src/lib/contentStudio.js` to merge results
   - Update canvas state with new elements/settings
   - Show review notes in a panel

### Backend Enhancement

When SAM-3 orchestrator is ready:

1. Replace mocked data in `sam3DesignTaskService.js` with actual SAM-3 calls
2. Integrate with VisionEngine, TextEngine, or ContentEngine as needed
3. Add proper error handling and retry logic
4. Add metrics and logging for design tasks

## Files Modified/Created

### Created
- `src/orchestrator/services/sam3DesignTaskService.js` - Service implementation
- `docs/SAM3_CONTENT_STUDIO_INTEGRATION.md` - This document

### Modified
- `src/orchestrator/api/orchestratorRoutes.js` - Added `/design-task` endpoint
- `src/orchestrator/index.js` - Added `content_studio` entry point
- `src/orchestrator/types.ts` - Added TypeScript interfaces

## Testing

### Manual Testing

1. Start the backend server
2. Authenticate and get a token
3. Send a POST request to `/api/orchestrator/design-task` with valid payload
4. Verify response structure and mocked data

### Unit Tests (TODO)

Add tests in `tests/orchestrator/`:
- Test request validation
- Test service with different modes
- Test error handling
- Test response structure

## Notes

- The endpoint is authenticated using the same `requireAuth` middleware as other dashboard routes
- Canvas state is passed as `unknown` type to allow flexibility in canvas structure
- The service currently returns mocked data - ready for SAM-3 integration
- All error responses follow the standard `{ ok: false, error, message }` format
- Success responses include a `taskId` for tracking and debugging

