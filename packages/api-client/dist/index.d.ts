/**
 * @cardbey/api-client
 * Shared API client for communicating with Cardbey Core backend
 */
/**
 * Structured error thrown by API client
 */
export declare class ApiClientError extends Error {
    status?: number | undefined;
    details?: any | undefined;
    constructor(message: string, status?: number | undefined, details?: any | undefined);
}
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
    accessToken?: string;
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
    handle?: string;
    tagline?: string | null;
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
export declare function registerUser(payload: RegisterPayload): Promise<RegisterResponse>;
/**
 * Login user
 * POST /auth/login (will be prefixed with /api by buildUrl if needed)
 * Backend accepts either email or username
 *
 * Returns LoginResult with normalized accessToken and user object
 */
export declare function loginUser(credentials: LoginCredentials): Promise<LoginResult>;
/**
 * Get current user
 * GET /auth/me (will be prefixed with /api by buildUrl if needed)
 * Returns null if user is not authenticated (401)
 *
 * Response shape: { ok: true, user: { ..., stores: [], hasStore: false } }
 */
export declare function getCurrentUser(accessToken: string): Promise<UserResponse | null>;
/**
 * Verify email with token
 * GET /auth/verify?token=... (will be prefixed with /api by buildUrl if needed)
 *
 * @param token - Verification token from email
 * @returns Success response
 * @throws ApiClientError if token is invalid or expired
 */
export declare function verifyEmail(token: string): Promise<{
    ok: boolean;
    message: string;
}>;
/**
 * Update user profile
 * PATCH /auth/profile (will be prefixed with /api by buildUrl if needed)
 *
 * @param payload - Profile fields to update
 * @param accessToken - Authentication token
 * @returns Updated user profile
 */
export declare function updateProfile(payload: UpdateProfilePayload, accessToken: string): Promise<UserProfile>;
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
export declare function getPublicProfile(handle: string): Promise<PublicUserProfile>;
export interface PublicProduct {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    price?: number | null;
    currency?: string | null;
    imageUrl?: string | null;
    sku?: string | null;
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
    products?: PublicProduct[];
}
/**
 * List all public stores (active stores only)
 * GET /public/stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of PublicStore (lightweight, no products by default)
 *
 * @returns Array of public stores
 */
export declare function listPublicStores(): Promise<PublicStore[]>;
/**
 * Get public store profile by slug
 * GET /public/stores/:slug (will be prefixed with /api by buildUrl if needed)
 * No authentication required
 *
 * @param slug - Store's public slug
 * @returns Public store profile
 * @throws ApiClientError with status 404 if store not found
 */
export declare function getPublicStore(slug: string): Promise<PublicStore>;
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
export declare function createStore(payload: CreateStorePayload, accessToken: string): Promise<Store>;
/**
 * List all stores for the current user
 * GET /stores (will be prefixed with /api by buildUrl if needed)
 * Returns array of stores
 */
export declare function listStores(accessToken: string): Promise<Store[]>;
//# sourceMappingURL=index.d.ts.map