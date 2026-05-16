/**
 * Creative Agent (Imaginarium v1)
 * Generates proactive, contextual creative ideas based on orchestrator context
 */

import { CreativeContext, CreativeProposal, CreativeResponse } from './types.js';

/**
 * Creative Agent Interface
 */
export interface CreativeAgent {
  /**
   * Generate creative proposals based on context
   * @param context - Creative context
   * @returns Creative response with proposals
   */
  generateProposals(context: CreativeContext): Promise<CreativeResponse>;
}

/**
 * Default Creative Agent Implementation
 * Stub implementation that returns hard-coded proposals based on scene type
 * 
 * TODO: Replace with real LLM-based creative generation
 */
export class DefaultCreativeAgent implements CreativeAgent {
  /**
   * Generate creative proposals
   * Returns dummy proposals based on sceneType
   */
  async generateProposals(context: CreativeContext): Promise<CreativeResponse> {
    // TODO: Replace with real LLM-based creative generation
    // This is a stub that returns hard-coded proposals based on scene type
    
    const proposals: CreativeProposal[] = [];

    switch (context.sceneType) {
      case 'loyalty_card':
        proposals.push(
          {
            id: `proposal-${Date.now()}-1`,
            title: 'Mystery 10th Coffee Day',
            description: 'Reward customers with a free coffee on their 10th visit. The mystery element adds excitement and encourages repeat visits.',
            category: 'loyalty',
            estimatedImpact: 'high',
            complexity: 'simple',
            requiredSkills: ['loyalty', 'campaign'],
            followUpPlanSummary: 'Set up a digital loyalty card system with automatic tracking and reward notification on the 10th visit.'
          },
          {
            id: `proposal-${Date.now()}-2`,
            title: 'VIP Tier After 30 Visits',
            description: 'Create a VIP tier for your most loyal customers. After 30 visits, unlock exclusive perks like priority service, special discounts, and early access to new items.',
            category: 'loyalty',
            estimatedImpact: 'high',
            complexity: 'moderate',
            requiredSkills: ['loyalty', 'tiered_rewards'],
            followUpPlanSummary: 'Implement a tiered loyalty system with automatic VIP status upgrade and exclusive benefits.'
          },
          {
            id: `proposal-${Date.now()}-3`,
            title: 'Birthday Bonus Program',
            description: 'Send a special birthday offer to customers. A personalized discount or free item on their birthday increases engagement and makes customers feel valued.',
            category: 'loyalty',
            estimatedImpact: 'medium',
            complexity: 'simple',
            requiredSkills: ['loyalty', 'email_campaign'],
            followUpPlanSummary: 'Set up birthday tracking and automated birthday offer delivery system.'
          }
        );
        break;

      case 'shopfront':
        proposals.push(
          {
            id: `proposal-${Date.now()}-1`,
            title: 'Digital Signage Display',
            description: 'Install a C-Net digital display in your shopfront to showcase daily specials, promotions, and menu items. Dynamic content keeps your storefront fresh and engaging.',
            category: 'cnet',
            estimatedImpact: 'high',
            complexity: 'moderate',
            requiredSkills: ['cnet', 'screen_setup', 'content_design'],
            followUpPlanSummary: 'Set up a C-Net screen, create promotional content, and schedule daily specials.'
          },
          {
            id: `proposal-${Date.now()}-2`,
            title: 'AR Menu Experience',
            description: 'Create an augmented reality experience where customers can point their phone at your shopfront to see an interactive menu with 3D product previews and nutritional information.',
            category: 'ar',
            estimatedImpact: 'medium',
            complexity: 'advanced',
            requiredSkills: ['ar', 'mobile_app', '3d_modeling'],
            followUpPlanSummary: 'Develop AR markers, create 3D product models, and build mobile AR viewer.'
          },
          {
            id: `proposal-${Date.now()}-3`,
            title: 'Smart Window Display',
            description: 'Transform your shopfront window into an interactive display that changes based on time of day, weather, or special events. Show breakfast items in the morning, lunch specials at noon.',
            category: 'cnet',
            estimatedImpact: 'medium',
            complexity: 'moderate',
            requiredSkills: ['cnet', 'automation', 'content_scheduling'],
            followUpPlanSummary: 'Configure time-based content scheduling and weather-responsive display logic.'
          }
        );
        break;

      case 'menu_photo':
        proposals.push(
          {
            id: `proposal-${Date.now()}-1`,
            title: 'Combo Meal Promotion',
            description: 'Create attractive combo meal packages from your menu items. Bundle popular items together at a discounted price to increase average order value.',
            category: 'menu',
            estimatedImpact: 'high',
            complexity: 'simple',
            requiredSkills: ['menu_design', 'pricing'],
            followUpPlanSummary: 'Design combo meal packages, update menu with combo pricing, and create promotional materials.'
          },
          {
            id: `proposal-${Date.now()}-2`,
            title: 'Daily Special Highlight',
            description: 'Feature a rotating daily special prominently in your menu. Use eye-catching design and limited-time messaging to create urgency and drive sales.',
            category: 'campaign',
            estimatedImpact: 'medium',
            complexity: 'simple',
            requiredSkills: ['menu_design', 'campaign'],
            followUpPlanSummary: 'Create daily special template, set up rotation schedule, and design promotional graphics.'
          },
          {
            id: `proposal-${Date.now()}-3`,
            title: 'Seasonal Menu Refresh',
            description: 'Update your menu with seasonal items that match current trends and ingredients. A fresh seasonal menu keeps customers coming back to try new offerings.',
            category: 'menu',
            estimatedImpact: 'medium',
            complexity: 'moderate',
            requiredSkills: ['menu_design', 'content_creation'],
            followUpPlanSummary: 'Design seasonal menu items, create new menu layout, and update all marketing materials.'
          }
        );
        break;

      case 'campaign_setup':
        proposals.push(
          {
            id: `proposal-${Date.now()}-1`,
            title: 'Multi-Channel Campaign',
            description: 'Launch your campaign across multiple channels simultaneously - social media, email, in-store displays, and digital signage. Consistent messaging amplifies your reach.',
            category: 'campaign',
            estimatedImpact: 'high',
            complexity: 'moderate',
            requiredSkills: ['campaign', 'social_media', 'email', 'cnet'],
            followUpPlanSummary: 'Create campaign assets, schedule posts across channels, and set up tracking.'
          },
          {
            id: `proposal-${Date.now()}-2`,
            title: 'Influencer Partnership',
            description: 'Partner with local influencers to promote your campaign. Authentic recommendations from trusted voices can significantly boost campaign visibility.',
            category: 'campaign',
            estimatedImpact: 'high',
            complexity: 'advanced',
            requiredSkills: ['campaign', 'influencer_outreach', 'content_creation'],
            followUpPlanSummary: 'Identify local influencers, create partnership packages, and coordinate content creation.'
          },
          {
            id: `proposal-${Date.now()}-3`,
            title: 'Loyalty Integration',
            description: 'Integrate your campaign with your loyalty program. Reward customers for campaign participation with bonus points or exclusive offers.',
            category: 'campaign',
            estimatedImpact: 'medium',
            complexity: 'moderate',
            requiredSkills: ['campaign', 'loyalty', 'integration'],
            followUpPlanSummary: 'Link campaign actions to loyalty rewards, set up bonus point triggers, and create exclusive offers.'
          }
        );
        break;

      default: // 'generic'
        proposals.push(
          {
            id: `proposal-${Date.now()}-1`,
            title: 'Brand Refresh Campaign',
            description: 'Refresh your brand identity with updated visuals, messaging, and marketing materials. A cohesive brand experience builds trust and recognition.',
            category: 'branding',
            estimatedImpact: 'medium',
            complexity: 'moderate',
            requiredSkills: ['branding', 'design', 'content_creation'],
            followUpPlanSummary: 'Develop new brand guidelines, update all marketing materials, and roll out refreshed identity.'
          },
          {
            id: `proposal-${Date.now()}-2`,
            title: 'Customer Engagement Initiative',
            description: 'Launch a customer engagement program with interactive elements, feedback collection, and community building. Engaged customers become loyal advocates.',
            category: 'operational',
            estimatedImpact: 'medium',
            complexity: 'moderate',
            requiredSkills: ['engagement', 'feedback', 'community'],
            followUpPlanSummary: 'Set up feedback collection system, create engagement activities, and build customer community platform.'
          }
        );
        break;
    }

    return {
      proposals
    };
  }
}

/**
 * Create a default Creative Agent instance
 */
export function createCreativeAgent(): CreativeAgent {
  return new DefaultCreativeAgent();
}


