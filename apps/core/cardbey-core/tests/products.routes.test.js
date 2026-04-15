import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Product routes - Phase 1 fields', () => {
  let testUser;
  let testBusiness;
  let testProduct;

  beforeEach(async () => {
    await resetDb(prisma);

    // Create a test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'test-hash',
        displayName: 'Test User',
        roles: '["viewer"]',
        hasBusiness: true
      }
    });

    // Create a test business
    testBusiness = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Test Business',
        type: 'General',
        slug: 'test-business',
        isActive: true
      }
    });

    // Create a test product
    testProduct = await prisma.product.create({
      data: {
        businessId: testBusiness.id,
        name: 'Test Product',
        description: 'Test description',
        price: 29.99,
        currency: 'USD',
        isPublished: false,
        viewCount: 0,
        likeCount: 0
      }
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('GET /api/products - returns products with Phase 1 fields', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
    
    const product = res.body.products[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('description');
    expect(product).toHaveProperty('images');
    expect(product).toHaveProperty('viewCount');
    expect(product).toHaveProperty('likeCount');
    expect(product).toHaveProperty('deletedAt');
  });

  it('PATCH /api/products/:id - updates product with new fields', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const updateData = {
      name: 'Updated Product Name',
      price: 39.99,
      description: 'Updated description',
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      isPublished: true
    };

    const res = await testRequest
      .patch(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(updateData)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.product).toBeDefined();
    expect(res.body.product.name).toBe('Updated Product Name');
    expect(res.body.product.price).toBe(39.99);
    expect(res.body.product.description).toBe('Updated description');
    expect(res.body.product.images).toEqual(updateData.images);
    expect(res.body.product.isPublished).toBe(true);
  });

  it('PATCH /api/products/:id - supports partial updates', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Update only name
    const res = await testRequest
      .patch(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Partially Updated Product'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.product.name).toBe('Partially Updated Product');
    expect(res.body.product.price).toBe(29.99); // Should remain unchanged
    expect(res.body.product.description).toBe('Test description'); // Should remain unchanged
  });

  it('PATCH /api/products/:id - allows setting price to null', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .patch(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        price: null
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.product.price).toBeNull();
  });

  it('DELETE /api/products/:id - soft deletes product by setting deletedAt', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Delete the product
    const res = await testRequest
      .delete(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.product.deletedAt).toBeTruthy();
    expect(new Date(res.body.product.deletedAt)).toBeInstanceOf(Date);

    // Verify product is excluded from GET /api/products
    const listRes = await testRequest
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.ok).toBe(true);
    expect(listRes.body.products.find(p => p.id === testProduct.id)).toBeUndefined();
  });

  it('DELETE /api/products/:id - returns 404 if product already deleted', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // First delete the product
    await testRequest
      .delete(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Try to delete again
    const res = await testRequest
      .delete(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Product not found');
  });

  it('PATCH /api/products/:id - returns 404 if product is soft-deleted', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Soft delete the product
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { deletedAt: new Date() }
    });

    // Try to update deleted product
    const res = await testRequest
      .patch(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' })
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Product not found');
  });
});



