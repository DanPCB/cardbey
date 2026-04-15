import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { parsePromotionPrompt } from '../services/promptParser.js';
import { generatePoster } from '../services/creator.js';
import { makeCNetClient } from '../adapters/cnet.js';
import '../dto/playlist.js';

const prisma = new PrismaClient();
const workflowsRouter = Router();
const cnetClient = makeCNetClient();

const FromPromptBody = z.object({
  prompt: z.string().min(4, 'prompt-too-short'),
});

workflowsRouter.post('/api/workflows/from-prompt', async (req, res, next) => {
  try {
    const { prompt } = FromPromptBody.parse(req.body);
    const parsed = parsePromotionPrompt(prompt);

    const actions = [
      {
        type: 'generate_poster',
        input: {
          productName: parsed.productName,
          discountPct: parsed.discountPct,
        },
      },
      {
        type: 'publish_cnet',
        input: {
          playlistId: parsed.screens[0],
          durationSec: parsed.durationSec,
        },
      },
    ];

    const workflow = await prisma.workflow.create({
      data: {
        name: `Promo: ${parsed.productName}`,
        prompt,
        actions,
      },
    });

    const poster = await generatePoster({
      productName: parsed.productName,
      discountPct: parsed.discountPct,
    });

    /** @type {import('../dto/playlist.js').PlaylistPayload} */
    const previewPlaylist = {
      playlistId: parsed.screens[0],
      items: [
        {
          type: 'image',
          src: poster.imageUrl,
          durationMs: parsed.durationSec * 1000,
          caption: poster.caption,
        },
      ],
    };

    res.json({ workflow, previewPlaylist });
  } catch (error) {
    next(error);
  }
});

workflowsRouter.post('/api/workflows/:id/execute', async (req, res, next) => {
  try {
    const id = req.params.id;
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const actions = Array.isArray(workflow.actions)
      ? workflow.actions
      : Array.isArray(workflow.actions?.steps)
      ? workflow.actions.steps
      : [];

    let poster = null;
    /** @type {import('../dto/playlist.js').PlaylistPayload | null} */
    let payload = null;

    for (const action of actions) {
      if (action.type === 'generate_poster') {
        poster = await generatePoster(action.input || {});
      } else if (action.type === 'publish_cnet') {
        if (!poster) {
          throw new Error('generate_poster must run before publish_cnet');
        }
        const playlistId = action.input?.playlistId || 'Default';
        const durationSec = action.input?.durationSec || 120;
        payload = {
          playlistId,
          items: [
            {
              type: 'image',
              src: poster.imageUrl,
              durationMs: durationSec * 1000,
              caption: poster.caption,
            },
          ],
        };
        await cnetClient.publishPlaylist(payload);
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        title: workflow.name,
        data: { payload, poster },
        status: 'RUNNING',
        workflow: { connect: { id: workflow.id } },
      },
    });

    res.json({ ok: true, campaign });
  } catch (error) {
    next(error);
  }
});

workflowsRouter.get('/api/workflows/:id', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
    });
    if (!workflow) {
      return res.status(404).end();
    }
    res.json(workflow);
  } catch (error) {
    next(error);
  }
});

workflowsRouter.get('/api/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });
    if (!campaign) {
      return res.status(404).end();
    }
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

export default workflowsRouter;

