import { Router } from 'express';
import { z } from 'zod';
import {
  generateDesignSuggestions,
  generateCaptions,
  generatePalette,
  isAIAvailable,
} from '../services/aiService.js';

const router = Router();

const ElementSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  text: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fontSize: z.number().optional(),
  src: z.string().optional(),
});

const SnapshotSchema = z.object({
  elements: z.array(ElementSchema).default([]),
  selectedIds: z.array(z.string()).optional().default([]),
  settings: z.record(z.unknown()).optional(),
  exportFormat: z.string().optional(),
});

const StudioEventSchema = z
  .object({
    event: z.string(),
    payload: z.unknown(),
  })
  .optional();

const BodySchema = z.object({
  lastEvent: StudioEventSchema,
  snapshot: SnapshotSchema,
});

router.post('/suggestions', async (req, res) => {
  const parse = BodySchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: parse.error.flatten() });
  }

  const { lastEvent, snapshot } = parse.data;
  let suggestions = [];

  // Try AI-powered suggestions first
  if (isAIAvailable()) {
    try {
      const aiSuggestions = await generateDesignSuggestions(snapshot, lastEvent);
      if (aiSuggestions && aiSuggestions.length > 0) {
        console.log(`[Studio] AI generated ${aiSuggestions.length} suggestions`);
        return res.json({ ok: true, suggestions: aiSuggestions, source: 'ai' });
      }
    } catch (error) {
      console.error('[Studio] AI suggestion generation failed, falling back to mock:', error);
      // Fall through to mock suggestions
    }
  }

  // Fallback to mock suggestions
  const elements = snapshot.elements;

  const pickTarget = () => {
    const selected = snapshot.selectedIds ?? [];
    if (selected.length) {
      const first = elements.find((el) => el.id === selected[0]);
      if (first) return first;
    }
    return elements[0];
  };

  const targetElement = pickTarget();

  if (targetElement) {
    suggestions.push({
      label: 'Suggest animation timing',
      action: 'patch',
      payload: [
        {
          id: targetElement.id,
          patch: {
            animIn: 'fade',
            delay: 0.2,
          },
        },
      ],
    });
  }

  if (targetElement?.text && (targetElement.text.length > 60 || (targetElement.width ?? 0) < 200)) {
    suggestions.push({
      label: 'Fix text overflow',
      action: 'patch',
      payload: [
        {
          id: targetElement.id,
          patch: {
            fontSize: Math.max((targetElement.fontSize ?? 48) - 6, 20),
            lineHeight: 1.2,
          },
        },
      ],
    });
  }

  if ((snapshot.exportFormat ?? '').toLowerCase() !== 'png') {
    suggestions.push({
      label: 'Predict best export format: PNG',
      action: 'set',
      payload: { exportFormat: 'png' },
    });
  }

  const palette = ['#ffb703', '#219ebc', '#023047'];
  const textTargets = elements.filter((el) => (el.kind ?? '').toLowerCase() === 'text');
  if (textTargets.length) {
    const patches = textTargets.map((el, index) => ({
      id: el.id,
      patch: { fill: palette[index % palette.length] },
    }));
    suggestions.push({
      label: 'Apply trending palette',
      action: 'patch',
      payload: patches,
    });
  }

  if (lastEvent?.event === 'export.started') {
    suggestions.unshift({
      label: 'Check export compression settings',
      action: 'set',
      payload: {
        settings: {
          compression: 0.82,
        },
      },
    });
  }

  return res.json({ ok: true, suggestions, source: 'mock' });
});

export default router;
