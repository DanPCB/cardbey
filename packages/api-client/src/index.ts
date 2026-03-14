/**
 * @cardbey/api-client
 * Shared API client for communicating with Cardbey Core backend
 */

/**
 * Structured error thrown by API client
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Get Core API base URL from environment
 * 
 * SINGLE SOURCE OF TRUTH: Uses getEffectiveCoreApiBaseUrl() from dashboard's getCoreApiBaseUrl.ts
 * 
 * CRITICAL DEV RULE: In browser dev on localhost with Vite, ALL API calls must use relative URLs
 * so Vite proxy handles routing. Do not allow absolute http://localhost:3001 in browser dev.
 */
function getCoreBaseUrl(): string {
  // CRITICAL: Try to use centralized resolver from dashboard (if available)
  // This ensures consistent behavior across all API clients
  try {
    // @ts-ignore - Dynamic import to avoid circular dependencies
    const { getEffectiveCoreApiBaseUrl } = require('../../dashboard/cardbey-marketing-dashboard/src/lib/getCoreApiBaseUrl');
    if (typeof getEffectiveCoreApiBaseUrl === 'function') {
      return getEffectiveCoreApiBaseUrl();
    }
  } catch {
    // Fallback if centralized resolver not available (e.g., in different package)
  }
  
  // Fallback: Check for Vite dev mode first (before checking localStorage)
  // This ensures we return '' (relative URLs) in Vite dev, even if localStorage has a value
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    const isVitePort = window.location.port === '5174';
    // @ts-ignore - import.meta is available in Vite
    const isViteEnv = import.meta?.env?.DEV === true || 
                      import.meta?.env?.MODE === 'development';
    
    if (isLocalhost && isVitePort && isViteEnv) {
      // Vite dev mode: ALWAYS return '' to force relative URLs through Vite proxy
      // IGNORE localStorage.cardbey.dev.coreUrl for URL resolution
      return '';
    }
  }
  
  // Non-Vite environments: check localStorage and env vars
  // 1. Check DEV Context localStorage (cardbey.dev.coreUrl)
  if (typeof window !== 'undefined') {
    try {
      const devCoreUrl = localStorage.getItem('cardbey.dev.coreUrl');
      if (devCoreUrl && typeof devCoreUrl === 'string' && devCoreUrl.trim()) {
        const normalized = devCoreUrl.trim().replace(/\/+$/, '');
        // Normalize 0.0.0.0 to localhost for consistency
        return normalized.replace(/0\.0\.0\.0/g, 'localhost');
      }
    } catch {
      // localStorage access failed, continue to next check
    }
  }

  // 2. Check window.__APP_API_BASE__ (runtime override)
  if (typeof window !== 'undefined') {
    const fromWindow = (window as any).__APP_API_BASE__ as string | undefined;
    if (fromWindow && typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim().replace(/\/+$/, '');
    }
  }

  // 3. Check VITE_CORE_BASE_URL (build-time env)
  // @ts-ignore - import.meta is available in Vite
  const fromEnv = import.meta?.env?.VITE_CORE_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  
  // Server-side: fail fast if no base URL configured
  throw new Error(
    'CORE base URL missing. Set cardbey.dev.coreUrl in localStorage (DEV Context), VITE_CORE_BASE_URL, or window.__APP_API_BASE__.'
  );
}

/**
 * Build full API URL
 * Ensures path starts with /api if it doesn't already
 */
function buildUrl(path: string): string {
  const base = getCoreBaseUrl();
  
  // Ensure path starts with /
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // If path doesn't start with /api, add it (matching dashboard's ensureApiPath logic)
  if (!cleanPath.startsWith('/api')) {
    cleanPath = `/api${cleanPath}`;
  }
  
  // CRITICAL: In browser mode, if base is empty (dev mode), use relative path
  // This ensures requests go through Vite proxy (same-origin, cookies work)
  if (!base) {
    // Browser mode: return relative path (goes through Vite proxy)
    return cleanPath;
  }
  
  // Server-side or explicit base URL: return absolute URL
  return `${base}${cleanPath}`;
}

/**
 * Make HTTP request to Core API
 */
async function request<T = any>(
  method: string,
  path: string,
  options: {
    body?: any;
    accessToken?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const url = buildUrl(path);
  const { body, accessToken, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    'Accept': 'application/json',
    ...headers,
  };

  if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: requestHeaders,
      body: body ? (body instanceof FormData || body instanceof Blob ? body : JSON.stringify(body)) : undefined,
    });
  } catch (fetchError: any) {
    const errorMsg = fetchError?.message || String(fetchError || '');
    if (
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('NetworkError') ||
      errorMsg.includes('Network error') ||
      errorMsg.includes('CORS') ||
      errorMsg.includes('connection refused') ||
      errorMsg.includes('ERR_CONNECTION_REFUSED')
    ) {
      throw new ApiClientError(
        `Unable to connect to server. Please ensure Cardbey Core is running.`,
        undefined,
        { originalError: errorMsg }
      );
    }
    throw new ApiClientError(errorMsg || 'Network request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as T;
  }

  // Parse response with Content-Type validation
  let data: any;
  try {
    const contentType = response.headers.get('content-type') || '';
    
    // Check if response is JSON
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Non-JSON response - likely HTML error page or redirect
      const text = await response.text();
      
      // Try to parse as JSON anyway (some servers don't set Content-Type correctly)
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON - this is likely an HTML error page or redirect
        // Log the issue and throw a clear error
        const isDev = typeof window !== 'undefined' && 
                     (window.location.hostname === 'localhost' || 
                      (window as any).__APP_API_BASE__);
        
        if (isDev) {
          console.error('[api-client] Non-JSON response received:', {
            status: response.status,
            statusText: response.statusText,
            contentType,
            url: response.url,
            textPreview: text.substring(0, 200),
          });
        }
        
        // If status is 401/403, treat as auth error
        if (response.status === 401 || response.status === 403) {
          throw new ApiClientError(
            'Not authenticated - please log in again',
            response.status,
            { response, text }
          );
        }
        
        // If status is 404, treat as endpoint not found
        if (response.status === 404) {
          throw new ApiClientError(
            'API endpoint not found - check coreUrl configuration',
            response.status,
            { response, text }
          );
        }
        
        // For other non-JSON responses, throw a clear error
        throw new ApiClientError(
          `Invalid response format: expected JSON but received ${contentType || 'unknown'}. This usually means the API endpoint returned HTML instead of JSON. Check your coreUrl configuration.`,
          response.status,
          { response, text: text.substring(0, 500) }
        );
      }
    }
  } catch (parseError) {
    // If it's already an ApiClientError, re-throw it
    if (parseError instanceof ApiClientError) {
      throw parseError;
    }
    
    // Otherwise, wrap it
    throw new ApiClientError(
      `Failed to parse response: ${parseError}`,
      response.status,
      { originalError: parseError }
    );
  }

  // Handle errors
  if (!response.ok) {
    const raw =
      data?.error ?? data?.message ?? data?.detail ??
      `HTTP ${response.status} ${response.statusText}`;
    const errorMessage =
      typeof raw === 'string'
        ? raw
        : response.status === 502 || response.status === 503
          ? 'Server unreachable. Please ensure Cardbey Core is running.'
          : `Request failed: ${response.status} ${response.statusText}`;
    throw new ApiClientError(errorMessage, response.status, data);
  }

  return data as T;
}

// ============================================================================
// Auth Types & Functions
// ============================================================================

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  ok: boolean;
  user?: {
    id: string;
    username?: string;
    displayName?: string;
    role?: string;
    email?: string;
    stores?: Store[];
    hasStore?: boolean;
  };
  token?: string;
  error?: string;
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    username?: string;
    displayName?: string;
    role?: string;
    email?: string;
    stores?: Store[];
    hasStore?: boolean;
  };
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  accessToken?: string; // Alias for token (backend returns both)
  user?: {
    id: string;
    username?: string;
    displayName?: string;
    role?: string;
    email?: string;
    stores?: Store[];
    hasStore?: boolean;
  };
  refreshToken?: string;
  adminToken?: string;
  apiKey?: string;
  expiresIn?: string;
  expiresAt?: string;
  error?: string;
  message?: string;
}

export interface User {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  fullName?: string;
  role?: string;
  stores?: Store[];
  hasStore?: boolean;
  accountType?: "personal" | "business" | "both";
  avatarUrl?: string | null;
  emailVerified?: boolean;
  handle?: string; // Public profile handle/slug
  tagline?: string | null; // Optional tagline/bio
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  fullName?: string;
  name?: string;
  email: string;
  accountType?: "personal" | "business" | "both";
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  handle?: string | null;
  tagline?: string | null;
  role?: string;
  [key: string]: any;
}

export interface UpdateProfilePayload {
  fullName?: string;
  name?: string;
  email?: string;
  accountType?: "personal" | "business" | "both";
}

export interface UserResponse {
  ok: boolean;
  user: {
    id: string;
    username?: string;
    displayName?: string | null;
    email?: string;
    fullName?: string;
    role?: string;
    stores?: Store[];
    hasStore?: boolean;
    emailVerified?: boolean;
    accountType?: "personal" | "business" | "both";
    avatarUrl?: string | null;
    handle?: string | null;
    tagline?: string | null;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: any;
  };
  error?: string;
}

/**
 * Register a new user
 * POST /auth/register (will be prefixed with /api by buildUrl if needed)
 */
export async function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  const email = payload.email.trim().toLowerCase();

  const normalizedPayload = {
    email,
    password: payload.password,
    fullName: payload.fullName?.trim(),
  };

  try {
    const response = await request<RegisterResponse>('POST', '/auth/register', {
      body: normalizedPayload,
    });
    return response;
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Registration failed',
      error?.status,
      error
    );
  }
}

/**
 * Login user
 * POST /auth/login (will be prefixed with /api by buildUrl if needed)
 * Backend accepts either email or username
 * 
 * Returns LoginResult with normalized accessToken and user object
 */
export async function loginUser(credentials: LoginCredentials): Promise<LoginResult> {
  const payload: {
    email?: string;
    username?: string;
    password: string;
  } = {
    password: credentials.password,
  };

  // Backend accepts either email or username
  const identifier = credentials.email.trim();
  if (identifier.includes('@')) {
    payload.email = identifier;
  } else {
    payload.username = identifier;
  }

  try {
    const response = await request<LoginResponse>('POST', '/auth/login', {
      body: payload,
    });

    // Extract accessToken (prefer accessToken, fallback to token)
    const accessToken = response.accessToken || response.token;
    if (!accessToken) {
      throw new ApiClientError('Login response missing access token', 200, response);
    }

    // Extract user object
    if (!response.user) {
      throw new ApiClientError('Login response missing user object', 200, response);
    }

    return {
      accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    };
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Login failed',
      error?.status,
      error
    );
  }
}

/**
 * Get current user
 * GET /auth/me (will be prefixed with /api by buildUrl if needed)
 * Returns null if user is not authenticated (401)
 * 
 * Response shape: { ok: true, user: { ..., stores: [], hasStore: false } }
 */
export async function getCurrentUser(accessToken: string): Promise<UserResponse | null> {
  try {
    const response = await request<UserResponse>('GET', '/auth/me', {
      accessToken,
    });
    
    // CRITICAL: Check for empty object {} first - treat as null (backend error)
    // This prevents {} from propagating to user service and causing "Invalid response format" errors
    if (response && typeof response === 'object' && Object.keys(response).length === 0) {
      // Empty object {} - treat as null (backend error)
      return null;
    }
    
    // Ensure response has ok and user fields
    if (response && response.ok && response.user) {
      return response;
    }
    
    // If response exists but doesn't match expected shape, return null
    return null;
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      // 401 Unauthorized means no user or invalid token
      if (error.status === 401) {
        return null;
      }
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to fetch user',
      error?.status,
      error
    );
  }
}

/**
 * Verify email with token
 * GET /auth/verify?token=... (will be prefixed with /api by buildUrl if needed)
 * 
 * @param token - Verification token from email
 * @returns Success response
 * @throws ApiClientError if token is invalid or expired
 */
export async function verifyEmail(token: string): Promise<{ ok: boolean; message: string }> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new ApiClientError('Token is required', 400);
  }

  try {
    const response = await request<{ ok: boolean; message?: string; error?: string }>(
      'GET',
      `/auth/verify?token=${encodeURIComponent(token)}`,
      {} // No auth required
    );
    
    if (response && response.ok) {
      return {
        ok: true,
        message: response.message || 'Email verified successfully'
      };
    }
    
    // Handle error response
    throw new ApiClientError(
      response?.error || response?.message || 'Verification failed',
      400,
      response
    );
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to verify email',
      error?.status,
      error
    );
  }
}

/**
 * Update user profile
 * PATCH /auth/profile (will be prefixed with /api by buildUrl if needed)
 *
 * @param payload - Profile fields to update
 * @param accessToken - Authentication token
 * @returns Updated user profile
 */
export async function updateProfile(
  payload: UpdateProfilePayload,
  accessToken: string
): Promise<UserProfile> {
  try {
    const response = await request<{ ok: boolean; user: UserProfile }>('PATCH', '/auth/profile', {
      body: payload,
      accessToken,
    });
    
    if (response && response.ok && response.user) {
      return response.user;
    }
    
    throw new ApiClientError('Invalid response from profile update', 200, response);
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to update profile',
      error?.status,
      error
    );
  }
}

// ============================================================================
// Public Profile Types & Functions
// ============================================================================

export interface PublicStoreSummary {
  id: string;
  name: string;
  slug?: string | null;
}

export interface PublicUserProfile {
  handle: string;
  fullName: string | null;
  avatarUrl?: string | null;
  accountType?: "personal" | "business" | "both";
  tagline?: string | null;
  stores: PublicStoreSummary[];
}

/**
 * Get public user profile by handle
 * GET /public/users/:handle (will be prefixed with /api by buildUrl if needed)
 * No authentication required
 * 
 * @param handle - User's public handle/slug
 * @returns Public user profile
 * @throws ApiClientError with status 404 if user not found
 */
export async function getPublicProfile(handle: string): Promise<PublicUserProfile> {
  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    throw new ApiClientError('Handle is required', 400);
  }

  try {
    const response = await request<{ ok: boolean; profile?: PublicUserProfile; error?: string; message?: string }>(
      'GET',
      `/public/users/${encodeURIComponent(handle)}`,
      {} // No auth required
    );
    
    if (response && response.ok && response.profile) {
      return response.profile;
    }
    
    // Handle 404 - user not found
    if (response && !response.ok && (response.error === 'User not found' || response.message === 'User not found')) {
      throw new ApiClientError('User not found', 404, response);
    }
    
    // Invalid response format
    throw new ApiClientError('Invalid response from public profile endpoint', 200, response);
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    // Handle 404 from HTTP response
    if (error?.status === 404 || error?.statusCode === 404) {
      throw new ApiClientError('User not found', 404, error);
    }
    throw new ApiClientError(
      error?.message || 'Failed to fetch public profile',
      error?.status || error?.statusCode,
      error
    );
  }
}

export interface PublicProduct {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number | null; // Price as Float
  currency?: string | null; // Currency code (e.g., "USD", "AUD")
  imageUrl?: string | null;
  sku?: string | null; // SKU/product code
}

export interface PublicStore {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  city?: string | null;
  country?: string | null;
  products?: PublicProduct[]; // Array of published products
}

/**
 * List all public stores (active stores only)
 * GET /public/stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of PublicStore (lightweight, no products by default)
 * 
 * @returns Array of public stores
 */
export async function listPublicStores(): Promise<PublicStore[]> {
  try {
    const response = await request<{ ok: boolean; stores?: PublicStore[] }>(
      'GET',
      '/public/stores',
      {} // No auth required
    );
    
    if (response && response.ok && Array.isArray(response.stores)) {
      return response.stores;
    }
    
    return [];
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to list public stores',
      error?.status,
      error
    );
  }
}

/**
 * Get public store profile by slug
 * GET /public/stores/:slug (will be prefixed with /api by buildUrl if needed)
 * No authentication required
 * 
 * @param slug - Store's public slug
 * @returns Public store profile
 * @throws ApiClientError with status 404 if store not found
 */
export async function getPublicStore(slug: string): Promise<PublicStore> {
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    throw new ApiClientError('Slug is required', 400);
  }

  try {
    const response = await request<{ ok: boolean; store?: PublicStore; error?: string; message?: string }>(
      'GET',
      `/public/stores/${encodeURIComponent(slug)}`,
      {} // No auth required
    );
    
    if (response && response.ok && response.store) {
      return response.store;
    }
    
    // Handle 404 - store not found
    if (response && !response.ok && (response.error === 'Store not found' || response.message === 'Store not found')) {
      throw new ApiClientError('Store not found', 404, response);
    }
    
    // Invalid response format
    throw new ApiClientError('Invalid response from public store endpoint', 200, response);
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    // Handle 404 from HTTP response
    if (error?.status === 404 || error?.statusCode === 404) {
      throw new ApiClientError('Store not found', 404, error);
    }
    throw new ApiClientError(
      error?.message || 'Failed to fetch public store',
      error?.status || error?.statusCode,
      error
    );
  }
}

// ============================================================================
// Store Types & Functions
// ============================================================================

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  creationMethod?: 'manual' | 'ai' | 'ocr' | 'library';
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStorePayload {
  name: string;
  creationMethod: 'manual' | 'ai' | 'ocr' | 'library';
}

/**
 * Create a new store
 * POST /stores (will be prefixed with /api by buildUrl if needed)
 * Returns the created store object (201 response: { ok: true, store: {...} })
 */
export async function createStore(
  payload: CreateStorePayload,
  accessToken: string
): Promise<Store> {
  const normalizedPayload = {
    name: payload.name.trim(),
    creationMethod: payload.creationMethod || 'manual',
  };

  try {
    // Core returns 201 with { ok: true, store: {...} }
    const response = await request<{ ok: boolean; store?: Store; error?: string; message?: string }>('POST', '/stores', {
      body: normalizedPayload,
      accessToken,
    });
    
    // Extract store from response
    if (response && response.ok && response.store) {
      return response.store;
    }
    
    // Handle error response
    if (response && !response.ok) {
      const errorMsg = response.error || response.message || 'Failed to create store';
      throw new ApiClientError(errorMsg, 201, response);
    }
    
    // Invalid response format
    throw new ApiClientError('Invalid store response from server', 201, response);
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to create store',
      error?.status,
      error
    );
  }
}

/**
 * List all stores for the current user
 * GET /stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of stores
 */
export async function listStores(accessToken: string): Promise<Store[]> {
  try {
    const response = await request<{ ok: boolean; stores?: Store[] }>('GET', '/stores', {
      accessToken,
    });
    
    // Core returns { ok: true, stores: [...] }
    if (response && response.ok && Array.isArray(response.stores)) {
      return response.stores;
    }
    
    // If response doesn't match expected shape, return empty array
    return [];
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      // On 401, throw with friendly message
      if (error.status === 401) {
        throw new ApiClientError('Authentication required to list stores', 401, error.details);
      }
      throw error;
    }
    throw new ApiClientError(
      error?.message || 'Failed to list stores',
      error?.status,
      error
    );
  }
}

// Store type is already exported above in the Store interface definition

