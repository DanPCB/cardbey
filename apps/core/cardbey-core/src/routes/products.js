/**
 * Product Routes
 * GET /api/products - Get products for a business
 * PATCH /api/products/:id - Update a product
 * DELETE /api/products/:id - Soft delete a product
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Zod schema for product update validation
const ProductUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().min(0).optional().nullable(),
  description: z.string().trim().nullable().optional(),
  images: z.any().optional(), // JSON array of image URLs
  isPublished: z.boolean().optional(), // visibility field
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided for update'
  }
);

/**
 * GET /api/products
 * Get products for the authenticated user's business
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Query params:
 *   - businessId?: string (optional, defaults to user's business)
 * 
 * Response (200):
 *   - ok: true
 *   - products: Array of Product objects with fields: id, name, price, description, images, viewCount, likeCount, deletedAt
 * 
 * Errors:
 *   - 401: Not authenticated
 *   - 404: Business not found
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Get user's business
    const business = await prisma.business.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      return res.status(404).json({
        ok: false,
        error: 'Business not found',
        message: 'You must have a business to view products'
      });
    }

    // Get businessId from query or use user's business
    const businessId = req.query.businessId || business.id;

    // Verify business belongs to user if businessId is provided
    if (req.query.businessId && businessId !== business.id) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to access this business'
      });
    }

    // Fetch products (excluding soft-deleted ones)
    const products = await prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
        images: true,
        viewCount: true,
        likeCount: true,
        deletedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error('[Products] List error:', error);
    next(error);
  }
});

/**
 * PATCH /api/products/:id
 * Update a product
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body (all fields optional):
 *   - name?: string
 *   - price?: number | null
 *   - description?: string | null
 *   - images?: array (JSON array of image URLs)
 *   - isPublished?: boolean (visibility)
 * 
 * Response (200):
 *   - ok: true
 *   - product: Updated Product object
 * 
 * Errors:
 *   - 400: Invalid input
 *   - 401: Not authenticated
 *   - 403: Product does not belong to user's business
 *   - 404: Product not found
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body with zod
    const validationResult = ProductUpdateSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }

    const updateData = validationResult.data;

    // Get user's business
    const business = await prisma.business.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      return res.status(404).json({
        ok: false,
        error: 'Business not found',
        message: 'You must have a business to update products'
      });
    }

    // Find product and verify ownership
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found',
        message: 'Product not found'
      });
    }

    if (product.businessId !== business.id) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this product'
      });
    }

    // Check if product is soft-deleted
    if (product.deletedAt) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found',
        message: 'Product has been deleted'
      });
    }

    // Build update data object
    const prismaUpdateData = {};
    
    if (updateData.name !== undefined) {
      prismaUpdateData.name = updateData.name;
    }
    if (updateData.price !== undefined) {
      prismaUpdateData.price = updateData.price;
    }
    if (updateData.description !== undefined) {
      prismaUpdateData.description = updateData.description === '' ? null : updateData.description;
    }
    if (updateData.images !== undefined) {
      prismaUpdateData.images = updateData.images;
    }
    if (updateData.isPublished !== undefined) {
      prismaUpdateData.isPublished = updateData.isPublished;
    }

    // Update product
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: prismaUpdateData
    });

    console.log(`[Products] ✅ Product updated: ${updatedProduct.id} by user ${req.userId}`);

    res.json({
      ok: true,
      product: updatedProduct
    });
  } catch (error) {
    console.error('[Products] Update error:', error);
    next(error);
  }
});

/**
 * DELETE /api/products/:id
 * Soft delete a product by setting deletedAt
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - product: Deleted Product object
 * 
 * Errors:
 *   - 401: Not authenticated
 *   - 403: Product does not belong to user's business
 *   - 404: Product not found
 */
router.delete('/:id', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get user's business
    const business = await prisma.business.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      return res.status(404).json({
        ok: false,
        error: 'Business not found',
        message: 'You must have a business to delete products'
      });
    }

    // Find product and verify ownership
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found',
        message: 'Product not found'
      });
    }

    if (product.businessId !== business.id) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this product'
      });
    }

    // Check if already deleted
    if (product.deletedAt) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found',
        message: 'Product has already been deleted'
      });
    }

    // Soft delete by setting deletedAt
    const deletedProduct = await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date()
      }
    });

    console.log(`[Products] ✅ Product soft deleted: ${deletedProduct.id} by user ${req.userId}`);

    res.json({
      ok: true,
      product: deletedProduct
    });
  } catch (error) {
    console.error('[Products] Delete error:', error);
    next(error);
  }
});

export default router;

