/**
 * @cardbey/api-client
 * Shared API client for communicating with Cardbey Core backend
 */
/**
 * Structured error thrown by API client
 */
export class ApiClientError extends Error {
    constructor(message, status, details) {
        super(message);
        this.status = status;
        this.details = details;
        this.name = 'ApiClientError';
    }
}
/**
 * Get Core API base URL from environment
 * Checks window.__APP_API_BASE__ (runtime) or VITE_CORE_BASE_URL (build-time)
 */
function getCoreBaseUrl() {
    // 1. Check window.__APP_API_BASE__ (runtime override)
    if (typeof window !== 'undefined') {
        const fromWindow = window.__APP_API_BASE__;
        if (fromWindow && typeof fromWindow === 'string' && fromWindow.trim()) {
            return fromWindow.trim().replace(/\/+$/, '');
        }
    }
    // 2. Check VITE_CORE_BASE_URL (build-time env)
    // @ts-ignore - import.meta is available in Vite
    const fromEnv = import.meta?.env?.VITE_CORE_BASE_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim()) {
        return fromEnv.trim().replace(/\/+$/, '');
    }
    // 3. Fallback for dev mode - use relative paths
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // In dev, relative paths will go through Vite proxy
            return '';
        }
    }
    throw new Error('CORE base URL missing. Set VITE_CORE_BASE_URL or window.__APP_API_BASE__.');
}
/**
 * Build full API URL
 * Ensures path starts with /api if it doesn't already
 */
function buildUrl(path) {
    const base = getCoreBaseUrl();
    // Ensure path starts with /
    let cleanPath = path.startsWith('/') ? path : `/${path}`;
    // If path doesn't start with /api, add it (matching dashboard's ensureApiPath logic)
    if (!cleanPath.startsWith('/api')) {
        cleanPath = `/api${cleanPath}`;
    }
    if (!base) {
        // In dev mode with no base, use relative path
        return cleanPath;
    }
    return `${base}${cleanPath}`;
}
/**
 * Make HTTP request to Core API
 */
async function request(method, path, options = {}) {
    const url = buildUrl(path);
    const { body, accessToken, headers = {} } = options;
    const requestHeaders = {
        'Accept': 'application/json',
        ...headers,
    };
    if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
        requestHeaders['Content-Type'] = 'application/json';
    }
    if (accessToken) {
        requestHeaders['Authorization'] = `Bearer ${accessToken}`;
    }
    let response;
    try {
        response = await fetch(url, {
            method,
            credentials: 'include',
            headers: requestHeaders,
            body: body ? (body instanceof FormData || body instanceof Blob ? body : JSON.stringify(body)) : undefined,
        });
    }
    catch (fetchError) {
        const errorMsg = fetchError?.message || String(fetchError || '');
        if (errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('NetworkError') ||
            errorMsg.includes('Network error') ||
            errorMsg.includes('CORS') ||
            errorMsg.includes('connection refused') ||
            errorMsg.includes('ERR_CONNECTION_REFUSED')) {
            throw new ApiClientError(`Unable to connect to server. Please ensure Cardbey Core is running.`, undefined, { originalError: errorMsg });
        }
        throw new ApiClientError(errorMsg || 'Network request failed');
    }
    // Handle 204 No Content
    if (response.status === 204) {
        return null;
    }
    // Parse response
    let data;
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        }
        else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            }
            catch {
                data = text;
            }
        }
    }
    catch (parseError) {
        throw new ApiClientError(`Failed to parse response: ${parseError}`, response.status);
    }
    // Handle errors
    if (!response.ok) {
        const errorMessage = data?.error || data?.message || data?.detail || `HTTP ${response.status} ${response.statusText}`;
        throw new ApiClientError(errorMessage, response.status, data);
    }
    return data;
}
/**
 * Register a new user
 * POST /auth/register (will be prefixed with /api by buildUrl if needed)
 */
export async function registerUser(payload) {
    const email = payload.email.trim().toLowerCase();
    const normalizedPayload = {
        email,
        password: payload.password,
        fullName: payload.fullName?.trim(),
    };
    try {
        const response = await request('POST', '/auth/register', {
            body: normalizedPayload,
        });
        return response;
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Registration failed', error?.status, error);
    }
}
/**
 * Login user
 * POST /auth/login (will be prefixed with /api by buildUrl if needed)
 * Backend accepts either email or username
 *
 * Returns LoginResult with normalized accessToken and user object
 */
export async function loginUser(credentials) {
    const payload = {
        password: credentials.password,
    };
    // Backend accepts either email or username
    const identifier = credentials.email.trim();
    if (identifier.includes('@')) {
        payload.email = identifier;
    }
    else {
        payload.username = identifier;
    }
    try {
        const response = await request('POST', '/auth/login', {
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
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Login failed', error?.status, error);
    }
}
/**
 * Get current user
 * GET /auth/me (will be prefixed with /api by buildUrl if needed)
 * Returns null if user is not authenticated (401)
 *
 * Response shape: { ok: true, user: { ..., stores: [], hasStore: false } }
 */
export async function getCurrentUser(accessToken) {
    try {
        const response = await request('GET', '/auth/me', {
            accessToken,
        });
        // Ensure response has ok and user fields
        if (response && response.ok && response.user) {
            return response;
        }
        // If response exists but doesn't match expected shape, return null
        return null;
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            // 401 Unauthorized means no user or invalid token
            if (error.status === 401) {
                return null;
            }
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to fetch user', error?.status, error);
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
export async function verifyEmail(token) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
        throw new ApiClientError('Token is required', 400);
    }
    try {
        const response = await request('GET', `/auth/verify?token=${encodeURIComponent(token)}`, {} // No auth required
        );
        if (response && response.ok) {
            return {
                ok: true,
                message: response.message || 'Email verified successfully'
            };
        }
        // Handle error response
        throw new ApiClientError(response?.error || response?.message || 'Verification failed', 400, response);
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to verify email', error?.status, error);
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
export async function updateProfile(payload, accessToken) {
    try {
        const response = await request('PATCH', '/auth/profile', {
            body: payload,
            accessToken,
        });
        if (response && response.ok && response.user) {
            return response.user;
        }
        throw new ApiClientError('Invalid response from profile update', 200, response);
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to update profile', error?.status, error);
    }
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
export async function getPublicProfile(handle) {
    if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
        throw new ApiClientError('Handle is required', 400);
    }
    try {
        const response = await request('GET', `/public/users/${encodeURIComponent(handle)}`, {} // No auth required
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
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        // Handle 404 from HTTP response
        if (error?.status === 404 || error?.statusCode === 404) {
            throw new ApiClientError('User not found', 404, error);
        }
        throw new ApiClientError(error?.message || 'Failed to fetch public profile', error?.status || error?.statusCode, error);
    }
}
/**
 * List all public stores (active stores only)
 * GET /public/stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of PublicStore (lightweight, no products by default)
 *
 * @returns Array of public stores
 */
export async function listPublicStores() {
    try {
        const response = await request('GET', '/public/stores', {} // No auth required
        );
        if (response && response.ok && Array.isArray(response.stores)) {
            return response.stores;
        }
        return [];
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to list public stores', error?.status, error);
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
export async function getPublicStore(slug) {
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
        throw new ApiClientError('Slug is required', 400);
    }
    try {
        const response = await request('GET', `/public/stores/${encodeURIComponent(slug)}`, {} // No auth required
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
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        // Handle 404 from HTTP response
        if (error?.status === 404 || error?.statusCode === 404) {
            throw new ApiClientError('Store not found', 404, error);
        }
        throw new ApiClientError(error?.message || 'Failed to fetch public store', error?.status || error?.statusCode, error);
    }
}
/**
 * Create a new store
 * POST /stores (will be prefixed with /api by buildUrl if needed)
 * Returns the created store object (201 response: { ok: true, store: {...} })
 */
export async function createStore(payload, accessToken) {
    const normalizedPayload = {
        name: payload.name.trim(),
        creationMethod: payload.creationMethod || 'manual',
    };
    try {
        // Core returns 201 with { ok: true, store: {...} }
        const response = await request('POST', '/stores', {
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
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to create store', error?.status, error);
    }
}
/**
 * List all stores for the current user
 * GET /stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of stores
 */
export async function listStores(accessToken) {
    try {
        const response = await request('GET', '/stores', {
            accessToken,
        });
        // Core returns { ok: true, stores: [...] }
        if (response && response.ok && Array.isArray(response.stores)) {
            return response.stores;
        }
        // If response doesn't match expected shape, return empty array
        return [];
    }
    catch (error) {
        if (error instanceof ApiClientError) {
            // On 401, throw with friendly message
            if (error.status === 401) {
                throw new ApiClientError('Authentication required to list stores', 401, error.details);
            }
            throw error;
        }
        throw new ApiClientError(error?.message || 'Failed to list stores', error?.status, error);
    }
}
// Store type is already exported above in the Store interface definition
//# sourceMappingURL=index.js.map