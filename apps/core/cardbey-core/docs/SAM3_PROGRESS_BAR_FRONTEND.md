# SAM-3 Progress Bar Frontend Implementation Guide

## Overview

The backend now emits real-time progress events via Server-Sent Events (SSE) during SAM-3 processing. This guide shows how to implement a progress bar in your frontend UI.

## Backend Progress Events

The backend broadcasts progress events with the following structure:

```typescript
{
  taskId: string;           // Unique task identifier
  status: 'started' | 'processing' | 'completed' | 'error';
  progress: number;         // 0-100
  message: string;          // Human-readable status message
  mode: string;            // Task mode (e.g., 'product_cutout')
  timestamp: number;        // Unix timestamp
  // Optional fields:
  regionCount?: number;     // Number of regions found
  score?: number;          // SAM-3 confidence score
  error?: string;          // Error message (if status === 'error')
}
```

### Progress Stages

1. **Started** (0%): Task initiated
2. **Processing** (30%): Running SAM-3 inference
3. **Processing** (60%): SAM-3 inference complete, processing results
4. **Processing** (75%): Generating transparent cutout (for product_cutout mode)
5. **Completed** (100%): Task complete
6. **Error** (0%): Task failed

## Frontend Implementation

### Step 1: Connect to SSE Stream

```typescript
// hooks/useSam3Progress.ts
import { useEffect, useState, useRef } from 'react';

interface ProgressEvent {
  taskId: string;
  status: 'started' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  mode: string;
  timestamp: number;
  regionCount?: number;
  score?: number;
  error?: string;
}

export function useSam3Progress(taskId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) {
      setProgress(null);
      return;
    }

    // Connect to SSE stream
    const eventSource = new EventSource(
      `http://192.168.1.12:3001/api/stream?key=admin`
    );

    eventSourceRef.current = eventSource;

    // Listen for progress events
    eventSource.addEventListener('sam3.design_task.progress', (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        
        // Only update if this event is for our task
        if (data.taskId === taskId) {
          setProgress(data);
          
          // Close connection when complete or error
          if (data.status === 'completed' || data.status === 'error') {
            eventSource.close();
            eventSourceRef.current = null;
          }
        }
      } catch (error) {
        console.error('Failed to parse progress event:', error);
      }
    });

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      eventSourceRef.current = null;
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [taskId]);

  return progress;
}
```

### Step 2: Create Progress Bar Component

```tsx
// components/Sam3ProgressBar.tsx
import React from 'react';
import { useSam3Progress } from '../hooks/useSam3Progress';

interface Sam3ProgressBarProps {
  taskId: string | null;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function Sam3ProgressBar({ taskId, onComplete, onError }: Sam3ProgressBarProps) {
  const progress = useSam3Progress(taskId);

  React.useEffect(() => {
    if (progress?.status === 'completed') {
      onComplete?.();
    } else if (progress?.status === 'error') {
      onError?.(progress.error || 'Unknown error');
    }
  }, [progress, onComplete, onError]);

  if (!taskId || !progress) {
    return null;
  }

  const isActive = progress.status === 'started' || progress.status === 'processing';
  const isComplete = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div className="sam3-progress-container">
      <div className="sam3-progress-bar-wrapper">
        <div className="sam3-progress-bar">
          <div
            className="sam3-progress-fill"
            style={{
              width: `${progress.progress}%`,
              backgroundColor: isError ? '#ef4444' : isComplete ? '#10b981' : '#8b5cf6',
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        </div>
        <div className="sam3-progress-text">
          <span className="sam3-progress-message">{progress.message}</span>
          <span className="sam3-progress-percentage">{progress.progress}%</span>
        </div>
      </div>
      
      {progress.status === 'processing' && progress.regionCount !== undefined && (
        <div className="sam3-progress-details">
          Found {progress.regionCount} region{progress.regionCount !== 1 ? 's' : ''}
        </div>
      )}
      
      {progress.status === 'completed' && progress.score !== undefined && (
        <div className="sam3-progress-details">
          Quality score: {(progress.score * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
```

### Step 3: Add CSS Styles

```css
/* styles/sam3-progress.css */
.sam3-progress-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: white;
  border-radius: 8px;
  padding: 16px 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  min-width: 400px;
  max-width: 600px;
}

.sam3-progress-bar-wrapper {
  margin-bottom: 8px;
}

.sam3-progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.sam3-progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.sam3-progress-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #374151;
}

.sam3-progress-message {
  font-weight: 500;
}

.sam3-progress-percentage {
  font-weight: 600;
  color: #6b7280;
}

.sam3-progress-details {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}
```

### Step 4: Integrate with Your API Call

```tsx
// components/ContentStudio.tsx or wherever you call the API
import React, { useState } from 'react';
import { Sam3ProgressBar } from './Sam3ProgressBar';

export function ContentStudio() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleBackgroundRemoval() {
    setIsProcessing(true);
    setTaskId(null);

    try {
      const response = await fetch('http://192.168.1.12:3001/api/orchestrator/design-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryPoint: 'content_studio',
          mode: 'product_cutout',
          target: 'image',
          canvasState: currentCanvasState,
          userPrompt: 'remove background around the cup in the image',
        }),
      });

      const data = await response.json();

      if (data.ok && data.taskId) {
        // Start tracking progress
        setTaskId(data.taskId);
      } else {
        setIsProcessing(false);
        // Handle error
      }
    } catch (error) {
      setIsProcessing(false);
      console.error('API error:', error);
    }
  }

  function handleProgressComplete() {
    setIsProcessing(false);
    // Refresh canvas or update UI
    refreshCanvas();
  }

  function handleProgressError(error: string) {
    setIsProcessing(false);
    // Show error message
    showError(error);
  }

  return (
    <div>
      {/* Your existing UI */}
      
      {/* Progress Bar */}
      {isProcessing && (
        <Sam3ProgressBar
          taskId={taskId}
          onComplete={handleProgressComplete}
          onError={handleProgressError}
        />
      )}

      <button onClick={handleBackgroundRemoval} disabled={isProcessing}>
        {isProcessing ? 'Processing...' : 'Remove Background'}
      </button>
    </div>
  );
}
```

## Alternative: Simple Progress Bar (No SSE)

If you prefer a simpler approach without SSE, you can show a loading state during the API call:

```tsx
function SimpleProgressBar({ isLoading, progress }: { isLoading: boolean; progress: number }) {
  if (!isLoading) return null;

  return (
    <div className="simple-progress-bar">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-text">
        Processing with SAM-3... {progress}%
      </div>
    </div>
  );
}

// Usage
const [isLoading, setIsLoading] = useState(false);
const [progress, setProgress] = useState(0);

async function handleBackgroundRemoval() {
  setIsLoading(true);
  setProgress(0);

  // Simulate progress (or use actual progress from SSE)
  const progressInterval = setInterval(() => {
    setProgress((prev) => Math.min(prev + 10, 90));
  }, 500);

  try {
    const response = await fetch('/api/orchestrator/design-task', { /* ... */ });
    const data = await response.json();
    
    clearInterval(progressInterval);
    setProgress(100);
    
    setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 500);
  } catch (error) {
    clearInterval(progressInterval);
    setIsLoading(false);
    setProgress(0);
  }
}
```

## Testing

1. **Start your backend server**
2. **Connect to SSE stream**: Open `http://192.168.1.12:3001/api/stream?key=admin` in your browser or use the EventSource API
3. **Trigger a design task**: Make a POST request to `/api/orchestrator/design-task`
4. **Watch progress events**: You should see events like:
   ```
   event: sam3.design_task.progress
   data: {"taskId":"sam3-1234567890-abc123","status":"started","progress":0,"message":"Starting SAM-3 processing...","mode":"product_cutout","timestamp":1234567890}
   ```

## Troubleshooting

### Progress bar not showing
- Check that `taskId` is set after API call
- Verify SSE connection is established (check browser console)
- Ensure backend is broadcasting events (check server logs)

### Progress stuck at 0%
- Verify the taskId matches between API response and progress events
- Check that SSE events are being received (add console.log in event handler)

### Connection errors
- Verify CORS is configured correctly
- Check that SSE endpoint is accessible: `http://192.168.1.12:3001/api/stream?key=admin`
- Ensure you're using the correct key ('admin' for development)

## Example: Complete Integration

See `docs/PRODUCT_CUTOUT_FRONTEND.md` for complete integration example with progress tracking.



