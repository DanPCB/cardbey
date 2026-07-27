/**
 * Store location geocoding routes — server-side only (no API keys on client).
 * POST /api/location/geocode
 * POST /api/location/reverse-geocode
 */

import { Router } from 'express';
import { z } from 'zod';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import { geocodeAddress, reverseGeocodeCoordinates } from '../lib/location/locationGeocodeService.js';

const router = Router();

const geocodeRateLimit = rateLimitMiddleware({
  endpoint: '/api/location/geocode',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

const reverseRateLimit = rateLimitMiddleware({
  endpoint: '/api/location/reverse-geocode',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

const GeocodeBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  countryBias: z.string().trim().max(100).optional().nullable(),
  cityBias: z.string().trim().max(100).optional().nullable(),
});

const ReverseGeocodeBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** POST /api/location/geocode */
router.post('/geocode', geocodeRateLimit, async (req, res) => {
  const parsed = GeocodeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      message: parsed.error.errors.map((e) => e.message).join(', '),
      results: [],
    });
  }

  try {
    const results = await geocodeAddress(parsed.data);
    return res.json({ ok: true, results });
  } catch (err) {
    console.error('[Location:geocode]', err?.message || err);
    return res.status(502).json({
      ok: false,
      error: 'geocode_failed',
      message: 'Geocoding service unavailable. Try again shortly.',
      results: [],
    });
  }
});

/** POST /api/location/reverse-geocode */
router.post('/reverse-geocode', reverseRateLimit, async (req, res) => {
  const parsed = ReverseGeocodeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      message: parsed.error.errors.map((e) => e.message).join(', '),
    });
  }

  try {
    const result = await reverseGeocodeCoordinates(parsed.data.latitude, parsed.data.longitude);
    if (!result) {
      return res.json({
        ok: true,
        formattedAddress: null,
        city: null,
        state: null,
        postcode: null,
        country: null,
        suburb: null,
        confidence: null,
      });
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Location:reverse-geocode]', err?.message || err);
    return res.status(502).json({
      ok: false,
      error: 'reverse_geocode_failed',
      message: 'Reverse geocoding service unavailable. Try again shortly.',
    });
  }
});

export default router;
