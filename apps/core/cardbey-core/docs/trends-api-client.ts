/**
 * Trends API Client
 * 
 * Copy this file to: cardbey-marketing-dashboard/src/api/trends.api.ts
 * 
 * Make sure to import your existing buildApiUrl helper function.
 */

// Replace this import with your actual API URL builder
// import { buildApiUrl } from './utils/api';

/**
 * Trend summary (without full data blob)
 */
export interface TrendSummary {
  id: string;
  slug: string;
  name: string;
  season?: string | null;
  goal?: string | null;
  domain?: string | null;
  isActive: boolean;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full trend profile (includes data blob)
 */
export interface TrendProfile extends TrendSummary {
  data: {
    palettes?: Array<{ name: string; colors: string[] }>;
    typography?: {
      headline?: { families: string[]; weight: string };
      body?: { families: string[]; weight: string };
    };
    layout_patterns?: string[];
    prompt_tags?: string[];
  };
  source?: string | null;
}

/**
 * Fetch list of active trends
 * 
 * @param params - Optional query parameters
 * @param params.goal - Filter by goal (e.g. "poster", "story")
 * @param params.search - Search by name or slug
 * @returns Array of trend summaries
 */
export async function fetchTrends(params?: { 
  goal?: string; 
  search?: string;
}): Promise<TrendSummary[]> {
  // Replace with your actual API base URL builder
  const baseUrl = '/api/trends'; // or use buildApiUrl('/api/trends')
  const url = new URL(baseUrl, window.location.origin);
  
  if (params?.goal) {
    url.searchParams.set('goal', params.goal);
  }
  if (params?.search) {
    url.searchParams.set('search', params.search);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to fetch trends: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.trends ?? data; // Adapt to backend response shape
}

/**
 * Fetch a single trend by ID or slug
 * 
 * @param idOrSlug - Trend ID or slug
 * @returns Full trend profile including data
 */
export async function fetchTrend(idOrSlug: string): Promise<TrendProfile> {
  // Replace with your actual API base URL builder
  const baseUrl = `/api/trends/${idOrSlug}`; // or use buildApiUrl(`/api/trends/${idOrSlug}`)
  const url = new URL(baseUrl, window.location.origin);

  const res = await fetch(url.toString());
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Trend not found: ${idOrSlug}`);
    }
    throw new Error(`Failed to fetch trend: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.trend ?? data; // Adapt to backend response shape
}

