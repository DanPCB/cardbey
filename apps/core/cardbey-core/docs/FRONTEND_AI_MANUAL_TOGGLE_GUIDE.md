# Frontend: AI Mode / Manual Edit Toggle Button

## Goal

Replace the separate "AI Mode" and "Manual Edit" buttons with a single toggle button that switches between AI Mode and Manual Edit UI. Keep all existing functions in both modes. Remove the "Minimal View" mode.

## Location

This change should be made in the **dashboard frontend repo**, likely in:
- `src/pages/ContentsStudio.tsx` or
- `src/components/ContentsStudio/ContentsStudio.tsx` or similar

## Implementation

### Step 1: Add Toggle State

Replace the separate button states with a single toggle state:

```typescript
// Before: Separate button states
const [isAIMode, setIsAIMode] = useState(false);
const [isManualMode, setIsManualMode] = useState(true);
const [isMinimalView, setIsMinimalView] = useState(false);

// After: Single toggle state
const [isAIMode, setIsAIMode] = useState(false); // false = Manual Edit, true = AI Mode
```

### Step 2: Replace Buttons with Toggle

Find the section with "AI Mode" and "Manual Edit" buttons and replace with a toggle:

```tsx
// Before:
<div className="flex gap-2">
  <button 
    onClick={() => setIsAIMode(true)}
    className={isAIMode ? 'active' : ''}
  >
    AI Mode
  </button>
  <button 
    onClick={() => setIsManualMode(true)}
    className={isManualMode ? 'active' : ''}
  >
    Manual Edit
  </button>
  {/* Remove Minimal View toggle */}
</div>

// After:
<div className="flex items-center gap-2">
  <span className="text-sm font-medium">Manual Edit</span>
  <label className="relative inline-flex items-center cursor-pointer">
    <input
      type="checkbox"
      checked={isAIMode}
      onChange={(e) => setIsAIMode(e.target.checked)}
      className="sr-only peer"
    />
    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
  </label>
  <span className="text-sm font-medium">AI Mode</span>
</div>
```

### Step 3: Remove Minimal View Logic

Remove any code related to Minimal View:

```typescript
// Remove this:
const [isMinimalView, setIsMinimalView] = useState(false);

// Remove any conditional rendering based on isMinimalView:
{/* Remove */}
{isMinimalView && <MinimalViewUI />}

// Remove Minimal View toggle UI:
{/* Remove */}
<label>
  <input 
    type="checkbox" 
    checked={isMinimalView}
    onChange={(e) => setIsMinimalView(e.target.checked)}
  />
  Minimal View
</label>
```

### Step 4: Update Conditional Rendering

Ensure that UI shows/hides based on `isAIMode` toggle:

```tsx
{isAIMode ? (
  // AI Mode UI - keep all existing functions
  <AIModePanel
    onGenerate={handleAIGenerate}
    onEdit={handleAIEdit}
    // ... all existing props
  />
) : (
  // Manual Edit UI - keep all existing functions
  <ManualEditPanel
    onElementAdd={handleAddElement}
    onElementEdit={handleEditElement}
    // ... all existing props
  />
)}
```

### Step 5: Alternative Toggle Component (Tailwind CSS)

If you prefer a simpler toggle button style:

```tsx
<button
  onClick={() => setIsAIMode(!isAIMode)}
  className={`
    relative inline-flex h-6 w-11 items-center rounded-full
    transition-colors duration-200 ease-in-out
    ${isAIMode ? 'bg-purple-600' : 'bg-gray-300'}
  `}
  role="switch"
  aria-checked={isAIMode}
  aria-label={isAIMode ? 'AI Mode' : 'Manual Edit'}
>
  <span
    className={`
      inline-block h-4 w-4 transform rounded-full bg-white
      transition-transform duration-200 ease-in-out
      ${isAIMode ? 'translate-x-6' : 'translate-x-1'}
    `}
  />
</button>
```

Or with labels:

```tsx
<div className="flex items-center gap-3">
  <span className={`text-sm font-medium ${!isAIMode ? 'text-purple-600' : 'text-gray-500'}`}>
    Manual Edit
  </span>
  
  <button
    onClick={() => setIsAIMode(!isAIMode)}
    className={`
      relative inline-flex h-6 w-11 items-center rounded-full
      transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
      ${isAIMode ? 'bg-purple-600' : 'bg-gray-300'}
    `}
    role="switch"
    aria-checked={isAIMode}
  >
    <span
      className={`
        inline-block h-4 w-4 transform rounded-full bg-white shadow-lg
        transition-transform duration-200 ease-in-out
        ${isAIMode ? 'translate-x-6' : 'translate-x-1'}
      `}
    />
  </button>
  
  <span className={`text-sm font-medium ${isAIMode ? 'text-purple-600' : 'text-gray-500'}`}>
    AI Mode
  </span>
</div>
```

## Complete Example Component

Here's a complete example showing how to structure the component:

```tsx
import { useState } from 'react';

export function ContentsStudio() {
  // Single toggle state: false = Manual Edit, true = AI Mode
  const [isAIMode, setIsAIMode] = useState(false);

  return (
    <div className="contents-studio">
      {/* Top Bar */}
      <div className="top-bar">
        {/* Other controls */}
        
        {/* Toggle Button */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${!isAIMode ? 'text-purple-600 font-semibold' : 'text-gray-500'}`}>
            Manual Edit
          </span>
          
          <button
            onClick={() => setIsAIMode(!isAIMode)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full
              transition-colors duration-200 ease-in-out
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
              ${isAIMode ? 'bg-purple-600' : 'bg-gray-300'}
            `}
            role="switch"
            aria-checked={isAIMode}
            aria-label={isAIMode ? 'Switch to Manual Edit' : 'Switch to AI Mode'}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white shadow-lg
                transition-transform duration-200 ease-in-out
                ${isAIMode ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
          
          <span className={`text-sm font-medium ${isAIMode ? 'text-purple-600 font-semibold' : 'text-gray-500'}`}>
            AI Mode
          </span>
        </div>
        
        {/* Other controls */}
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {isAIMode ? (
          // AI Mode UI - keep all existing functions
          <AIModePanel
            // ... all existing props and handlers
          />
        ) : (
          // Manual Edit UI - keep all existing functions
          <ManualEditPanel
            // ... all existing props and handlers
          />
        )}
      </div>
    </div>
  );
}
```

## Checklist

- [ ] Remove separate "AI Mode" and "Manual Edit" buttons
- [ ] Add single toggle button that switches between modes
- [ ] Remove "Minimal View" toggle and all related logic
- [ ] Keep all existing functions in both AI Mode and Manual Edit
- [ ] Update conditional rendering to use `isAIMode` toggle state
- [ ] Test that switching between modes works correctly
- [ ] Ensure all existing functionality is preserved

## Notes

- The toggle should be clearly labeled so users understand which mode is active
- Consider adding visual feedback (color changes, icons) when switching modes
- Make sure the toggle is accessible (keyboard navigation, screen readers)
- All existing functions should remain unchanged - only the UI control mechanism changes



