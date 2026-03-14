/**
 * Template Engine - Shared Types
 * 
 * Generic, extensible types for template fields/slots that can be reused
 * across Creative Engine, Video, Report, and Process templates.
 * 
 * This module provides the foundation for a unified template system.
 */

/**
 * Supported slot types for template placeholders
 */
export type TemplateSlotType =
  | 'text'
  | 'richtext'
  | 'image'
  | 'video'
  | 'color'
  | 'date'
  | 'number';

/**
 * Template Slot - Defines a placeholder/field in a template
 * 
 * Slots can be auto-filled from business/store context using sourceKey,
 * or use defaultValue if no source is available.
 */
export interface TemplateSlot {
  /** Internal ID used inside canvas JSON / content to reference this slot */
  id: string;
  
  /** Human-readable label for UI display */
  label: string;
  
  /** Type of slot (text, image, color, etc.) */
  type: TemplateSlotType;
  
  /** Whether this slot must be filled */
  required?: boolean;
  
  /** Default value if sourceKey is not available or doesn't resolve */
  defaultValue?: any;
  
  /**
   * Source key for auto-filling from business/store context
   * Supports dot-notation paths like "business.name", "business.logo.url"
   * 
   * Example sourceKeys:
   * - "business.name" -> Business.name
   * - "business.logo.url" -> Business.logo.url (if logo is JSON)
   * - "business.description" -> Business.description
   */
  sourceKey?: string;
  
  /** Optional description/help text for this slot */
  description?: string;
}

/**
 * Template AI Context - Metadata for AI-powered content generation
 * 
 * Used by AI engines to understand tone, audience, style, etc.
 * when generating or filling template content.
 */
export interface TemplateAIContext {
  /** Tone of the content: 'friendly', 'formal', 'casual', 'professional', etc. */
  tone?: string;
  
  /** Target audience: 'new_customers', 'loyal_customers', 'general', etc. */
  audience?: string;
  
  /** Primary language code: 'en', 'vi', etc. */
  language?: string;
  
  /** Style hints: ['modern', 'minimal', 'bold', 'elegant', etc.] */
  styleHints?: string[];
  
  /** Free-form metadata for future engines */
  [key: string]: any;
}

/**
 * Creative Template Fields Structure
 * 
 * For CreativeTemplate specifically (v1)
 * Future VideoTemplate, ReportTemplate, etc. can reuse TemplateSlot[] and TemplateAIContext
 */
export interface CreativeTemplateFields {
  /** Array of template slots/placeholders */
  slots?: TemplateSlot[];
  
  /** AI context metadata */
  aiContext?: TemplateAIContext | null;
}

