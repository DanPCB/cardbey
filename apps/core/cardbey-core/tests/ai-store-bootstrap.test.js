import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

/**
 * Mock slow/external dependencies so bootstrap tests are deterministic and fast in CI (<5s total).
 * - businessProfileService: avoid OpenAI (generatePalette, generateText for tagline/hero).
 *   Mock uses input.explicitName/storeName so store name in response matches request (e.g. "My Coffee Shop").
 * - miOrchestratorService: avoid template instantiation (DB + possible AI/image).
 * No changes to production endpoint logic; mocks return valid outputs only in tests.
 */
vi.mock('../src/services/businessProfileService.ts', () => ({
  generateBusinessProfile: vi.fn().mockImplementation((input) => {
    const name = input?.explicitName?.trim() || input?.storeName?.trim() || 'Test Cafe';
    const type = input?.explicitType || 'coffee-shop';
    return Promise.resolve({
      name,
      type,
      primaryColor: '#222222',
      secondaryColor: '#FF6600',
      tagline: 'Test tagline',
      heroText: 'Welcome to our test store.',
      stylePreferences: { style: 'modern', mood: 'warm' },
    });
  }),
}));

vi.mock('../src/services/miOrchestratorService.js', () => ({
  instantiateCreativeTemplateForContext: vi.fn().mockResolvedValue({
    content: { id: 'mock-content-id', miEntity: null },
    templateId: 'mock-template-id',
  }),
}));

import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('AI Store Bootstrap - Phase 1', () => {
  let testUser;

  beforeEach(async () => {
    await resetDb(prisma);

    // Create a test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'test-hash',
        displayName: 'Test User',
        roles: '["viewer"]',
        hasBusiness: false
      }
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('POST /api/ai/store/bootstrap - OCR mode creates store with products', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'ocr',
        storeName: 'Test Cafe',
        ocrRawText: 'Espresso $4\nLatte $5\nCappuccino $5.5\nCroissant $4'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.storeId).toBeDefined();
    expect(res.body.itemsCreated).toBeGreaterThan(0);

    // Verify store was created
    const store = await prisma.business.findUnique({
      where: { id: res.body.storeId }
    });
    expect(store).toBeTruthy();
    expect(store.name).toBe('Test Cafe');
    expect(store.userId).toBe(testUser.id);

    // Verify products were created
    const products = await prisma.product.findMany({
      where: { businessId: store.id }
    });
    expect(products.length).toBe(res.body.itemsCreated);
    expect(products.length).toBeGreaterThan(0);
  });

  it('POST /api/ai/store/bootstrap - AI description mode creates store with products', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'ai_description',
        storeName: 'My Coffee Shop',
        businessDescription: 'A cozy neighborhood cafe serving artisanal coffee and fresh pastries'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.storeId).toBeDefined();
    expect(res.body.itemsCreated).toBeGreaterThan(0);

    // Verify store was created with description
    const store = await prisma.business.findUnique({
      where: { id: res.body.storeId }
    });
    expect(store).toBeTruthy();
    expect(store.name).toBe('My Coffee Shop');
    expect(store.description).toContain('cozy neighborhood cafe');
  });

  it('POST /api/ai/store/bootstrap - Template mode creates store with products', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template',
        templateKey: 'cafe-menu'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.storeId).toBeDefined();
    expect(res.body.itemsCreated).toBeGreaterThan(0);

    // Verify products were created
    const products = await prisma.product.findMany({
      where: { businessId: res.body.storeId }
    });
    expect(products.length).toBe(res.body.itemsCreated);
    
    // Verify products have categories
    const productsWithCategories = products.filter(p => p.category);
    expect(productsWithCategories.length).toBeGreaterThan(0);
  });

  it('POST /api/ai/store/bootstrap - prevents duplicate products by name', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'ocr',
        storeName: 'Test Store',
        ocrRawText: 'Item 1 $10\nItem 1 $10\nItem 2 $20\nItem 1 $10'
      })
      .expect(200);

    // Verify only unique products were created
    const products = await prisma.product.findMany({
      where: { businessId: res.body.storeId }
    });
    
    const productNames = products.map(p => p.name.toLowerCase());
    const uniqueNames = new Set(productNames);
    expect(products.length).toBe(uniqueNames.size);
    expect(products.length).toBeLessThan(4); // Should have fewer than 4 due to duplicates
  });

  it('POST /api/ai/store/bootstrap - returns 409 if user already has store', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Create first store
    await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template',
        templateKey: 'cafe-menu'
      })
      .expect(200);

    // Try to create second store
    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template',
        templateKey: 'bakery'
      })
      .expect(409);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('User already has a store');
  });

  it('POST /api/ai/store/bootstrap - validates required fields for each mode', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Test OCR mode without ocrRawText
    const res1 = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'ocr'
      })
      .expect(400);

    expect(res1.body.ok).toBe(false);
    expect(res1.body.error).toBe('Validation error');

    // Test AI description mode without businessDescription
    const res2 = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'ai_description'
      })
      .expect(400);

    expect(res2.body.ok).toBe(false);

    // Test template mode without templateKey
    const res3 = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template'
      })
      .expect(400);

    expect(res3.body.ok).toBe(false);
  });

  it('POST /api/ai/store/bootstrap - auto-generates store name from template if not provided', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template',
        templateKey: 'cafe-menu'
      })
      .expect(200);

    const store = await prisma.business.findUnique({
      where: { id: res.body.storeId }
    });
    
    // Should auto-generate name from template key
    expect(store.name).toBeTruthy();
    expect(store.name.length).toBeGreaterThan(0);
  });

  it('POST /api/ai/store/bootstrap - creates products with isPublished=true', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .post('/api/ai/store/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'template',
        templateKey: 'cafe-menu'
      })
      .expect(200);

    const products = await prisma.product.findMany({
      where: { businessId: res.body.storeId }
    });

    // All bootstrap products should be published
    products.forEach(product => {
      expect(product.isPublished).toBe(true);
    });
  });
});



