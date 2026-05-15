import express from 'express';

import { prisma } from '../lib/prisma.js';

const router = express.Router();
router.get('/api/public/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { business: true },
    });

    if (!product || !product.isPublished || !product.business?.isActive) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({
      id: product.id,
      name: product.name,
      price: product.price,
      description: product.description,
      images: product.images,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
