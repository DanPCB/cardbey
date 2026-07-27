/**
 * Content Studio Helper Functions
 * Utilities for serializing and hydrating canvas designs
 */

/**
 * Serialize canvas state to Content model format
 * 
 * @param {Object} canvasState - Canvas state from Konva/React-Konva
 * @param {Object} options - Optional settings
 * @returns {Object} Content model data structure
 * 
 * Expected canvasState shape:
 * {
 *   elements: Array<CanvasElement>, // Array of canvas elements (text, images, shapes)
 *   settings: {                      // Canvas settings
 *     width: number,
 *     height: number,
 *     backgroundColor?: string,
 *     backgroundImage?: string,
 *     ...
 *   },
 *   renderSlide?: Object             // Optional pre-rendered slide data
 * }
 */
export function serializeCanvas(canvasState) {
  const { elements = [], settings = {}, renderSlide = null } = canvasState;

  // Ensure elements is an array
  const serializedElements = Array.isArray(elements) ? elements : [];

  // Ensure settings is an object
  const serializedSettings = typeof settings === 'object' && settings !== null 
    ? settings 
    : {};

  // Validate and clean elements
  const cleanedElements = serializedElements.map((element, index) => {
    // Ensure each element has at least an id
    if (!element.id) {
      return {
        ...element,
        id: element.id || `element-${Date.now()}-${index}`,
      };
    }
    return element;
  });

  return {
    elements: cleanedElements,
    settings: serializedSettings,
    renderSlide: renderSlide || null,
  };
}

/**
 * Hydrate canvas from Content model data
 * 
 * @param {Object} content - Content model from database
 * @returns {Object} Canvas state ready for Konva/React-Konva
 * 
 * Content model shape:
 * {
 *   id: string,
 *   name: string,
 *   elements: Json (array),
 *   settings: Json (object),
 *   renderSlide: Json (optional),
 *   version: number,
 *   ...
 * }
 */
export function hydrateCanvas(content) {
  if (!content) {
    return {
      elements: [],
      settings: {},
      renderSlide: null,
    };
  }

  // Parse JSON fields if they're strings (SQLite/PostgreSQL JSON handling)
  let elements = content.elements;
  let settings = content.settings;
  let renderSlide = content.renderSlide || null;

  // Handle string JSON from database
  if (typeof elements === 'string') {
    try {
      elements = JSON.parse(elements);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse elements JSON:', e);
      elements = [];
    }
  }

  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse settings JSON:', e);
      settings = {};
    }
  }

  if (typeof renderSlide === 'string') {
    try {
      renderSlide = JSON.parse(renderSlide);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse renderSlide JSON:', e);
      renderSlide = null;
    }
  }

  // Ensure elements is an array
  if (!Array.isArray(elements)) {
    console.warn('[ContentStudio] Elements is not an array, defaulting to []');
    elements = [];
  }

  // Ensure settings is an object
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    console.warn('[ContentStudio] Settings is not an object, defaulting to {}');
    settings = {};
  }

  return {
    elements: elements || [],
    settings: settings || {},
    renderSlide: renderSlide,
    version: content.version || 1,
    contentId: content.id,
    contentName: content.name,
  };
}

/**
 * Extract render slide data from canvas (for preview/export)
 * 
 * @param {Object} canvasState - Current canvas state
 * @returns {Object|null} Render slide data
 */
export function extractRenderSlide(canvasState) {
  // This can be extended to generate a render slide from canvas state
  // For now, return null or existing renderSlide
  return canvasState.renderSlide || null;
}

/**
 * Validate canvas elements structure
 * 
 * @param {Array} elements - Canvas elements array
 * @returns {boolean} True if valid
 */
export function validateElements(elements) {
  if (!Array.isArray(elements)) {
    return false;
  }

  // Each element should have basic properties
  return elements.every(element => {
    return element && typeof element === 'object';
  });
}

/**
 * Merge canvas updates (for partial updates)
 * 
 * @param {Object} existing - Existing canvas state
 * @param {Object} updates - Partial updates
 * @returns {Object} Merged canvas state
 */
export function mergeCanvasUpdates(existing, updates) {
  return {
    elements: updates.elements !== undefined ? updates.elements : existing.elements,
    settings: {
      ...existing.settings,
      ...(updates.settings || {}),
    },
    renderSlide: updates.renderSlide !== undefined ? updates.renderSlide : existing.renderSlide,
  };
}


