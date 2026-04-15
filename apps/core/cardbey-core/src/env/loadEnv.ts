/**
 * Shared Environment Variable Loader
 * Loads .env files with explicit paths (not relying on process.cwd())
 * Used by both API server and worker process
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

// Get the directory of this file (src/env/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the project root (apps/core/cardbey-core/)
// From src/env/loadEnv.ts -> src/ -> project root
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// Env file paths (in order of precedence)
const ENV_PATHS = [
  join(PROJECT_ROOT, '.env.local'),  // Highest priority (local overrides)
  join(PROJECT_ROOT, '.env'),         // Standard .env file
];

let envLoaded = false;

/**
 * Load environment variables from .env files
 * Uses explicit paths to avoid process.cwd() dependency
 */
export function loadEnv(): void {
  if (envLoaded) {
    return; // Already loaded
  }

  const loadedPaths: string[] = [];
  const missingPaths: string[] = [];

  // Try to load each .env file in order
  for (const envPath of ENV_PATHS) {
    if (existsSync(envPath)) {
      const result = config({ path: envPath, override: false });
      if (!result.error) {
        loadedPaths.push(envPath);
      }
    } else {
      missingPaths.push(envPath);
    }
  }

  // Log in dev mode
  if (process.env.NODE_ENV !== 'production') {
    console.log('[EnvLoader] Project root:', PROJECT_ROOT);
    if (loadedPaths.length > 0) {
      console.log('[EnvLoader] ✅ Loaded env files:', loadedPaths);
    }
    if (missingPaths.length > 0) {
      console.log('[EnvLoader] ⚠️  Missing env files (using defaults):', missingPaths);
    }
  }

  envLoaded = true;
}

/**
 * Parse boolean from environment variable
 * Supports: "true", "1", "yes", "on" => true
 * Everything else => false
 */
export function parseBoolean(value: string | undefined | null, defaultValue: boolean = false): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.toLowerCase().trim();
  
  return normalized === 'true' || 
         normalized === '1' || 
         normalized === 'yes' || 
         normalized === 'on';
}

/**
 * Get feature flag value with robust parsing
 */
export function getFeatureFlag(flagName: string, defaultValue: boolean = false): boolean {
  const envKey = flagName.toUpperCase().replace(/-/g, '_');
  const envValue = process.env[envKey];
  
  const parsed = parseBoolean(envValue, defaultValue);
  
  // Debug log in dev mode
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EnvLoader] Feature flag ${flagName}:`, {
      envKey,
      envValue: envValue || '(not set)',
      parsed,
      defaultValue,
    });
  }
  
  return parsed;
}

// Auto-load on import
loadEnv();

