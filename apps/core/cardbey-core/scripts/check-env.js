#!/usr/bin/env node
/**
 * Environment Validation Script
 * Validates critical environment variables using Zod
 * Exits with code 0 on success, non-zero on failure
 * 
 * CRITICAL: Validates required variables for video playback and production
 */

import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  // Core required variables
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Video playback and URL resolution (CRITICAL for production)
  PUBLIC_BASE_URL: z.string().url().optional().refine(
    (val) => {
      // If NODE_ENV is production, PUBLIC_BASE_URL is required
      if (process.env.NODE_ENV === 'production') {
        return !!val && val.startsWith('https://');
      }
      return true; // Optional in development
    },
    {
      message: 'PUBLIC_BASE_URL must be set to a full HTTPS URL in production (e.g., https://cardbey-core.onrender.com)',
    }
  ),
  
  // CloudFront/CDN (optional but recommended for production)
  CDN_BASE_URL: z.string().url().optional().refine(
    (val) => {
      if (val) {
        return val.startsWith('https://');
      }
      return true;
    },
    {
      message: 'CDN_BASE_URL must be a full HTTPS URL if set (e.g., https://d1234567890.cloudfront.net)',
    }
  ),
  
  // Authentication (CRITICAL for production)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').refine(
    (val) => {
      // In production, ensure it's not the default
      if (process.env.NODE_ENV === 'production') {
        const defaults = ['change-me-in-production', 'default-secret-change-this', 'dev-secret-change-in-production'];
        return !defaults.includes(val);
      }
      return true;
    },
    {
      message: 'JWT_SECRET must be changed from default value in production',
    }
  ),
  
  // Environment type
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // OAuth providers (optional)
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_REDIRECT_URI: z.string().optional(),
  
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),
  
  TWITTER_CLIENT_ID: z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  TWITTER_REDIRECT_URI: z.string().optional(),
});

function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log(`[Env] Validating environment variables (NODE_ENV=${process.env.NODE_ENV || 'development'})...\n`);
  
  try {
    const env = process.env;
    const result = EnvSchema.safeParse(env);
    
    if (!result.success) {
      console.error('❌ Environment validation failed:\n');
      
      for (const error of result.error.errors) {
        const path = error.path.join('.');
        console.error(`  • ${path}: ${error.message}`);
        
        // Provide actionable messages
        if (path === 'DATABASE_URL') {
          console.error('    💡 Set DATABASE_URL in your .env file');
          console.error('    💡 Example: DATABASE_URL=file:./prisma/dev.db (SQLite)');
          console.error('    💡 Example: DATABASE_URL=postgresql://user:pass@localhost:5432/dbname (PostgreSQL)');
        } else if (path === 'PUBLIC_BASE_URL') {
          console.error('    💡 Set PUBLIC_BASE_URL to your production HTTPS URL');
          console.error('    💡 Example: PUBLIC_BASE_URL=https://cardbey-core.onrender.com');
          console.error('    💡 This is CRITICAL for video URL resolution in production');
        } else if (path === 'CDN_BASE_URL') {
          console.error('    💡 Set CDN_BASE_URL if using CloudFront/S3');
          console.error('    💡 Example: CDN_BASE_URL=https://d1234567890.cloudfront.net');
          console.error('    💡 Optional but recommended for production');
        } else if (path === 'JWT_SECRET') {
          console.error('    💡 Set JWT_SECRET to a secure random string (at least 32 characters)');
          console.error('    💡 Example: JWT_SECRET=$(openssl rand -hex 32)');
          console.error('    💡 CRITICAL: Never use default values in production');
        }
      }
      
      console.error('\n');
      process.exit(1);
    }
    
    console.log('✅ All required environment variables are set\n');
    
    // Production-specific checks
    if (isProduction) {
      console.log('🔒 Production Environment Checks:\n');
      
      const checks = [];
      
      // Check PUBLIC_BASE_URL
      if (env.PUBLIC_BASE_URL) {
        if (env.PUBLIC_BASE_URL.startsWith('https://')) {
          checks.push({ name: 'PUBLIC_BASE_URL', status: '✅', message: `Set to ${env.PUBLIC_BASE_URL}` });
        } else {
          checks.push({ name: 'PUBLIC_BASE_URL', status: '⚠️', message: 'Should use HTTPS in production' });
        }
      } else {
        checks.push({ name: 'PUBLIC_BASE_URL', status: '❌', message: 'MISSING - Required for video URL resolution' });
      }
      
      // Check CDN_BASE_URL
      if (env.CDN_BASE_URL) {
        if (env.CDN_BASE_URL.startsWith('https://')) {
          checks.push({ name: 'CDN_BASE_URL', status: '✅', message: `Set to ${env.CDN_BASE_URL}` });
        } else {
          checks.push({ name: 'CDN_BASE_URL', status: '⚠️', message: 'Should use HTTPS' });
        }
      } else {
        checks.push({ name: 'CDN_BASE_URL', status: 'ℹ️', message: 'Not set (optional but recommended)' });
      }
      
      // Check JWT_SECRET
      if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
        const defaults = ['change-me-in-production', 'default-secret-change-this', 'dev-secret-change-in-production'];
        if (!defaults.includes(env.JWT_SECRET)) {
          checks.push({ name: 'JWT_SECRET', status: '✅', message: 'Set and secure (not default value)' });
        } else {
          checks.push({ name: 'JWT_SECRET', status: '❌', message: 'Using default value - CHANGE IMMEDIATELY' });
        }
      } else {
        checks.push({ name: 'JWT_SECRET', status: '❌', message: 'MISSING or too short (minimum 32 characters)' });
      }
      
      // Check NODE_ENV
      if (env.NODE_ENV === 'production') {
        checks.push({ name: 'NODE_ENV', status: '✅', message: 'Set to production' });
      } else {
        checks.push({ name: 'NODE_ENV', status: '⚠️', message: `Set to ${env.NODE_ENV || 'undefined'} (should be 'production')` });
      }
      
      // Display checks
      for (const check of checks) {
        console.log(`  ${check.status} ${check.name}: ${check.message}`);
      }
      
      const criticalFailures = checks.filter(c => c.status === '❌');
      if (criticalFailures.length > 0) {
        console.error('\n❌ CRITICAL: Some required variables are missing or invalid in production!\n');
        process.exit(1);
      }
      
      console.log('\n');
    }
    
    // Check optional OAuth providers
    const providers = [];
    if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET && env.FACEBOOK_REDIRECT_URI) {
      providers.push('Facebook');
    }
    if (env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REDIRECT_URI) {
      providers.push('TikTok');
    }
    if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET && env.TWITTER_REDIRECT_URI) {
      providers.push('Twitter');
    }
    
    if (providers.length > 0) {
      console.log(`✅ OAuth providers configured: ${providers.join(', ')}\n`);
    } else {
      console.log('ℹ️  No OAuth providers configured (optional)\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error during validation:', error.message);
    process.exit(1);
  }
}

main();

