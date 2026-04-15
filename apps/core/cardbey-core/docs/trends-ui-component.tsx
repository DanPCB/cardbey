/**
 * Style Trend Dropdown Component
 * 
 * This is an example component showing how to integrate the Style Trend dropdown
 * into your AI Design Assistant panel.
 * 
 * Copy the relevant parts to your existing Design Assistant component.
 */

import { useState, useEffect } from 'react';
import { fetchTrends, type TrendSummary } from '../api/trends.api'; // Adjust import path

interface StyleTrendSelectorProps {
  goal?: string; // Current goal (e.g. "poster", "story")
  selectedTrendId: string | 'auto';
  onTrendChange: (trendId: string | 'auto') => void;
}

export function StyleTrendSelector({ 
  goal, 
  selectedTrendId, 
  onTrendChange 
}: StyleTrendSelectorProps) {
  const [trends, setTrends] = useState<TrendSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch trends when component mounts or goal changes
  useEffect(() => {
    async function loadTrends() {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedTrends = await fetchTrends({ goal });
        setTrends(fetchedTrends);
      } catch (err) {
        console.error('[Trends] Failed to load trends:', err);
        setError(err instanceof Error ? err.message : 'Failed to load trends');
      } finally {
        setIsLoading(false);
      }
    }

    loadTrends();
  }, [goal]);

  return (
    <div className="style-trend-selector">
      <label htmlFor="style-trend" className="block text-sm font-medium mb-2">
        Style Trend
      </label>
      
      <select
        id="style-trend"
        value={selectedTrendId}
        onChange={(e) => onTrendChange(e.target.value as string | 'auto')}
        disabled={isLoading || trends.length === 0}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="auto">
          Auto (latest)
        </option>
        {trends.map((trend) => (
          <option key={trend.id} value={trend.id}>
            {trend.name}
            {trend.season ? ` (${trend.season})` : ''}
          </option>
        ))}
      </select>

      {isLoading && (
        <p className="mt-1 text-xs text-gray-500">Loading trends...</p>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {!isLoading && !error && trends.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">
          No trends available (using default style)
        </p>
      )}

      {selectedTrendId !== 'auto' && trends.length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          Using style: {trends.find(t => t.id === selectedTrendId)?.name}
          {trends.find(t => t.id === selectedTrendId)?.season && 
            ` (${trends.find(t => t.id === selectedTrendId)?.season})`
          }
        </p>
      )}
    </div>
  );
}

/**
 * Example integration in your existing Design Assistant component:
 * 
 * ```tsx
 * import { useState } from 'react';
 * import { StyleTrendSelector } from './StyleTrendSelector';
 * 
 * export function DesignAssistant() {
 *   const [selectedTrendId, setSelectedTrendId] = useState<string | 'auto'>('auto');
 *   const [goal, setGoal] = useState('poster');
 *   // ... other state
 * 
 *   const handlePlanDesign = async () => {
 *     const body = {
 *       prompt: formValues.prompt,
 *       goal: formValues.goal,
 *       // ... other fields
 *       ...(selectedTrendId !== 'auto' ? { trendId: selectedTrendId } : {}),
 *     };
 * 
 *     const response = await fetch('/api/ai/plan-design', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(body),
 *     });
 *     // ... handle response
 *   };
 * 
 *   const handleGenerateDesign = async (plan) => {
 *     const body = {
 *       ...plan,
 *       ...(selectedTrendId !== 'auto' ? { trendId: selectedTrendId } : {}),
 *     };
 * 
 *     const response = await fetch('/api/ai/generate-design', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(body),
 *     });
 *     // ... handle response
 *   };
 * 
 *   return (
 *     <div>
 *       {/* ... existing form fields */}
 *       
 *       {/* Add Style Trend selector */}
 *       <StyleTrendSelector
 *         goal={goal}
 *         selectedTrendId={selectedTrendId}
 *         onTrendChange={setSelectedTrendId}
 *       />
 * 
 *       {/* ... rest of form */}
 *     </div>
 *   );
 * }
 * ```
 */

