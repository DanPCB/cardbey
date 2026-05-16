/**
 * RAG (Retrieval-Augmented Generation) API Routes
 * 
 * Endpoints for querying the knowledge base using RAG
 */

import express from 'express';
import { getRagAnswer, buildRagContext } from '../services/ragService.js';
import { requestLog } from '../middleware/requestLog.js';
import { errorHandler } from '../middleware/errorHandler.js';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI client for streaming
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

// Apply logging to all RAG routes
router.use(requestLog);

/**
 * POST /api/rag/ask
 * Ask a question to the RAG system
 * 
 * Request body:
 *   - question: string (required) - The question to ask
 *   - scope?: string (optional) - Filter by scope (e.g., "device_engine", "dashboard")
 * 
 * Response:
 *   {
 *     ok: true,
 *     answer: string,
 *     scope?: string,
 *     sources: Array<{
 *       id: string,
 *       sourcePath: string,
 *       chunkIndex: number,
 *       snippet: string
 *     }>
 *   }
 */
router.post('/ask', async (req, res, next) => {
  try {
    const { question, scope, tenantId } = req.body;

    // Validate input
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: 'Question is required and must be a non-empty string',
      });
    }

    // Call RAG service
    const result = await getRagAnswer({
      question: question.trim(),
      scope: scope?.trim() || undefined,
      tenantId: tenantId?.trim() || undefined,
    });

    // TODO: Log assistant feedback if we have feedback UI
    // For now, we can log good answers when scope is tenant_activity
    // if (scope === 'tenant_activity' && result.sources.length > 0) {
    //   try {
    //     const { logAssistantFeedback, ActivityEventType } = await import('../services/activityEventService.js');
    //     await logAssistantFeedback({
    //       tenantId,
    //       userId: req.userId,
    //       type: ActivityEventType.ASSISTANT_GOOD_ANSWER,
    //       question,
    //       answer: result.answer,
    //     });
    //   } catch (logError) {
    //     console.warn('[RAG] Failed to log activity event (non-fatal):', logError.message);
    //   }
    // }

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const isTest = process.env.NODE_ENV === 'test';
    const isDev = process.env.NODE_ENV === 'development';

    // Detect "expected external dependency" failures using stable error code
    const isOpenAIMissing = error?.code === 'OPENAI_NOT_CONFIGURED';

    // In test OR dev, only fallback for known missing OpenAI
    // (In test mode, retrieval should work with deterministic embeddings, so this is rare)
    if ((isTest || isDev) && isOpenAIMissing) {
      if (isTest) {
        console.error('[RAG] OpenAI missing in test mode (returning fallback):', error);
      } else {
        console.warn('[RAG] OpenAI missing in dev; returning fallback:', error.message);
      }
      
      return res.status(200).json({
        ok: true,
        answer: isTest
          ? 'Test mode fallback answer'
          : 'Dev mode fallback answer (OpenAI not configured)',
        sources: [],
        scope: req.body?.scope || undefined,
        meta: { fallback: true, reason: 'openai_missing' },
      });
    }

    // ✅ Otherwise, fail normally (real bugs should surface in tests too)
    next(error);
  }
});

/**
 * POST /api/rag/ask/stream
 * Ask a question to the RAG system with streaming response
 * 
 * Request body:
 *   - question: string (required) - The question to ask
 *   - scope?: string (optional) - Filter by scope (e.g., "device_engine", "dashboard")
 * 
 * Response: Server-Sent Events (text/event-stream)
 *   - event: delta - Text chunks as they arrive
 *   - event: done - Final response with fullText and sources
 *   - event: error - Error message if something goes wrong
 */
router.post('/ask/stream', async (req, res, next) => {
  try {
    const { question, scope } = req.body;

    // Validate input
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Question is required and must be a non-empty string' })}\n\n`);
      res.end();
      return;
    }

    if (!HAS_OPENAI) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'OpenAI API key not configured' })}\n\n`);
      res.end();
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Build RAG context
    const contextResult = await buildRagContext(question.trim(), scope?.trim() || undefined);

    if (contextResult.chunks.length === 0) {
      res.write(`event: done\ndata: ${JSON.stringify({
        fullText: 'I don\'t have any knowledge base content to answer your question. Please ensure the knowledge base has been ingested.',
        sources: [],
        scope: contextResult.scope,
      })}\n\n`);
      res.end();
      return;
    }

    // Build prompt for LLM
    const systemPrompt = `You are the Cardbey product assistant. Your role is to help users understand Cardbey features, APIs, and workflows.

IMPORTANT RULES:
1. You must base your answers ONLY on the provided context below.
2. If the context doesn't contain enough information to answer the question, say so clearly and ask for more details.
3. Do not make up information or guess beyond what's in the context.
4. Be concise and helpful.
5. If you reference specific parts of the context, mention the source reference (e.g., "According to [src:1:...]").`;

    const userPrompt = `Context from knowledge base:

${contextResult.context}

---

Question: ${question.trim()}

Please provide a helpful answer based on the context above. If the context doesn't contain enough information, say so.`;

    // Call OpenAI with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    });

    let fullText = '';

    // Stream tokens as they arrive
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        // Send delta event
        res.write(`event: delta\ndata: ${JSON.stringify({ text: content })}\n\n`);
      }

      // Check if stream is done
      const finishReason = chunk.choices?.[0]?.finish_reason;
      if (finishReason === 'stop' || finishReason === 'length') {
        break;
      }
    }

    // Send final done event with full text and sources
    res.write(`event: done\ndata: ${JSON.stringify({
      fullText: fullText || 'I apologize, but I couldn\'t generate a response.',
      sources: contextResult.sources,
      scope: contextResult.scope,
    })}\n\n`);
    res.end();
  } catch (error) {
    // Send error event
    try {
      const errorMessage = error.message || 'An error occurred while processing your question';
      res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
      res.end();
    } catch (writeError) {
      // If we can't write the error, just end the response
      console.error('[RAG Stream] Error writing error event:', writeError);
      res.end();
    }
  }
});

export default router;

