/**
 * Template Generator Service
 * Converts AI proposals into real CreativeTemplate records with base Content
 */

import { PrismaClient } from '@prisma/client';
import type { AITemplateProposal } from './templateAIProposalService.js';
import { instantiateCreativeTemplateForContext } from './miOrchestratorService.js';
import * as miService from './miService.js';

const prisma = new PrismaClient();

export interface GenerateTemplateFromProposalParams {
  proposal: AITemplateProposal;
  categoryOverride?: string;
  channel?: string;
  orientation?: 'vertical' | 'horizontal' | 'square' | null;
  tenantId: string;
  storeId?: string | null;
  userId?: string | null;
  autoFillText?: boolean;
}

/**
 * Generate a real CreativeTemplate from an AI proposal
 * Creates template + base Content + instantiates it
 */
export async function generateTemplateFromProposal(
  params: GenerateTemplateFromProposalParams
): Promise<{
  ok: true;
  templateId: string;
  contentId: string;
} | {
  ok: false;
  error: string;
}> {
  try {
    const {
      proposal,
      categoryOverride,
      channel,
      orientation,
      tenantId,
      storeId,
      userId,
      autoFillText = false,
    } = params;

    // 1) Validate proposal
    if (!proposal || !proposal.name || !proposal.fields?.slots) {
      return {
        ok: false,
        error: 'Invalid proposal: missing required fields',
      };
    }

    // 2) Choose final metadata
    const finalChannels = channel 
      ? [channel]
      : (proposal.suggestedChannel 
          ? [proposal.suggestedChannel]
          : (categoryOverride === 'cnet' 
              ? ['cnet_screen']
              : categoryOverride === 'storefront'
              ? ['storefront', 'web']
              : categoryOverride === 'social'
              ? ['social']
              : ['cnet_screen', 'storefront', 'social']));

    const finalOrientation = orientation || proposal.suggestedOrientation || 'any';
    const finalRole = 'generic'; // Default role
    const finalPrimaryIntent = proposal.suggestedKind === 'GRAPHIC'
      ? 'promo_poster'
      : proposal.suggestedKind === 'VIDEO'
      ? 'video_content'
      : proposal.suggestedKind === 'REPORT'
      ? 'analytics_report'
      : 'process_template';

    const finalTags = [
      ...(proposal.tags || []),
      'ai_generated',
      proposal.suggestedKind.toLowerCase(),
    ];

    // 3) Pick layout archetype based on orientation
    const layout = getLayoutArchetype(finalOrientation, proposal.suggestedKind);

    // 4) Create base Content with layout
    const baseContent = await prisma.content.create({
      data: {
        name: `Base Content - ${proposal.name}`,
        userId: userId || null,
        elements: layout.canvasNodes,
        settings: layout.canvasSettings,
        version: 1,
      },
    });

    // 5) Create CreativeTemplate
    const template = await prisma.creativeTemplate.create({
      data: {
        name: proposal.name,
        description: proposal.description,
        thumbnailUrl: null, // Can be generated later
        tenantId: tenantId || null,
        storeId: storeId || null,
        baseContentId: baseContent.id,
        channels: JSON.stringify(finalChannels),
        role: finalRole,
        primaryIntent: finalPrimaryIntent,
        orientation: finalOrientation === 'any' ? null : finalOrientation,
        minDurationS: null,
        maxDurationS: null,
        tags: JSON.stringify(finalTags),
        isSystem: false, // User-generated templates
        isActive: true,
        fields: JSON.stringify(proposal.fields),
        aiContext: JSON.stringify(proposal.aiContext),
      },
    });

    // 6) Register MIEntity
    try {
      await miService.registerOrUpdateEntity({
        productId: template.id,
        productType: 'generic',
        mediaType: 'image',
        fileUrl: template.thumbnailUrl || '',
        previewUrl: template.thumbnailUrl || null,
        orientation: finalOrientation === 'any' ? undefined : finalOrientation as any,
        createdByUserId: userId || null,
        createdByEngine: 'ai_template_generator',
        miBrain: {
          role: finalRole,
          primaryIntent: finalPrimaryIntent,
          context: {
            channels: finalChannels,
            environmentHints: {
              screenOrientation: finalOrientation === 'any' ? undefined : finalOrientation,
            },
          },
          capabilities: {},
          behaviorRules: {},
        },
        links: {
          templateId: template.id,
        },
      });
    } catch (miError) {
      console.warn('[TemplateGenerator] Failed to register MIEntity:', miError);
      // Continue even if MIEntity registration fails
    }

    // 7) Instantiate template to create a real Content instance
    const instantiateResult = await instantiateCreativeTemplateForContext({
      templateContentId: template.id,
      tenantId,
      storeId: storeId || null,
      channel: finalChannels[0] || null,
      orientation: finalOrientation === 'any' ? null : finalOrientation as any,
      userId: userId || null,
      autoFillText,
    });

    if (!instantiateResult.content) {
      return {
        ok: false,
        error: 'Failed to instantiate template',
      };
    }

    return {
      ok: true,
      templateId: template.id,
      contentId: instantiateResult.content.id,
    };
  } catch (error) {
    console.error('[TemplateGenerator] Failed to generate template from proposal:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get layout archetype based on orientation and kind
 */
function getLayoutArchetype(
  orientation: string,
  kind: string
): {
  canvasNodes: any[];
  canvasSettings: any;
} {
  // Default dimensions
  let width = 1920;
  let height = 1080;

  if (orientation === 'vertical') {
    width = 1080;
    height = 1920;
  } else if (orientation === 'square') {
    width = 1080;
    height = 1080;
  }

  // Base canvas nodes (will be populated with slot mappings by frontend)
  const canvasNodes: any[] = [
    {
      id: 'headlineNode',
      kind: 'text',
      name: 'Headline',
      text: '{{headline}}',
      x: width * 0.1,
      y: height * 0.1,
      width: width * 0.8,
      height: 100,
      fontSize: orientation === 'vertical' ? 72 : orientation === 'square' ? 56 : 60,
      fontFamily: 'Inter',
      fill: '#ffffff',
      stroke: 'transparent',
      strokeWidth: 0,
      textAlign: 'left',
      shadowBlur: 0,
      shadowColor: 'rgba(0,0,0,0)',
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      meta: { templateSlotId: 'headline' },
    },
  ];

  const canvasSettings = {
    backgroundColor: '#1a1a2e',
    gridEnabled: false,
    gridSize: 20,
    backgroundLocked: false,
    layoutMode: 'split',
    backgroundSide: 'left',
    backgroundWidth: width,
    backgroundHeight: height,
  };

  return { canvasNodes, canvasSettings };
}

