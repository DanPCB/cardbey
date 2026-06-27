/**
 * Standardized store-creation error responses for Intake V2.
 *
 * Error codes (userMessage / suggestion / errorAction):
 * | Code              | User message                         | Suggestion                                      | Action                 |
 * |-------------------|--------------------------------------|-------------------------------------------------|------------------------|
 * | DUPLICATE_STORE   | "{name}" is already taken.           | Try "{name} Melbourne" or add your location.    | CHOOSE_DIFFERENT_NAME  |
 * | MISSING_NAME      | Store name is required               | Enter a name (e.g. "Joe's Coffee")              | FOCUS_NAME_FIELD       |
 * | MISSING_CATEGORY  | Please select a category               | Choose the category that best describes you     | FOCUS_CATEGORY         |
 * | MISSING_LOCATION  | Location is required                 | Enter your city or region (e.g. "Melbourne")    | FOCUS_LOCATION_FIELD   |
 * | INVALID_CATEGORY  | Invalid category selected            | Choose from the listed categories               | SHOW_CATEGORY_PICKER   |
 * | NETWORK_ERROR     | Unable to reach the server           | Check your internet connection and try again    | RETRY                  |
 * | AUTH_EXPIRED      | Your session has expired             | Please log in again to continue                 | REDIRECT_TO_LOGIN      |
 * | SERVER_ERROR      | Something went wrong                 | Please try again in a few minutes.                | RETRY_LATER            |
 * | RATE_LIMITED      | Too many attempts                    | Please wait a moment before trying again        | WAIT_AND_RETRY         |
 */

import { FactBuilder } from '../response/factBuilder.js';
import { buildIntakePayloadFromFact } from '../response/intakeFactResponse.js';

export const StoreCreationError = {
  DUPLICATE_STORE: {
    code: 'DUPLICATE_STORE',
    status: 409,
    intakeAction: 'duplicate_store',
    field: 'storeName',
    userMessage: (storeName) => `"${storeName}" is already taken.`,
    suggestion: (storeName) =>
      `Try "${storeName} Melbourne", "${storeName} Cafe", or add your location.`,
    errorAction: 'CHOOSE_DIFFERENT_NAME',
  },

  MISSING_NAME: {
    code: 'MISSING_NAME',
    status: 400,
    field: 'storeName',
    userMessage: 'Store name is required',
    suggestion: 'Enter a name for your store (e.g., "Joe\'s Coffee")',
    errorAction: 'FOCUS_NAME_FIELD',
  },

  MISSING_CATEGORY: {
    code: 'MISSING_CATEGORY',
    status: 400,
    field: 'category',
    userMessage: 'Please select a category',
    suggestion: 'Choose the category that best describes your business',
    errorAction: 'FOCUS_CATEGORY',
  },

  MISSING_LOCATION: {
    code: 'MISSING_LOCATION',
    status: 400,
    field: 'location',
    userMessage: 'Location is required',
    suggestion: 'Enter your city or region (e.g., "Melbourne")',
    errorAction: 'FOCUS_LOCATION_FIELD',
  },

  INVALID_CATEGORY: {
    code: 'INVALID_CATEGORY',
    status: 400,
    field: 'category',
    userMessage: 'Invalid category selected',
    suggestion:
      'Choose from: Fashion, Food & drink, Beauty, Home & garden, Electronics, Sports, Health, Arts & crafts, Other',
    errorAction: 'SHOW_CATEGORY_PICKER',
  },

  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    status: 503,
    userMessage: 'Unable to reach the server',
    suggestion: 'Check your internet connection and try again',
    errorAction: 'RETRY',
  },

  AUTH_EXPIRED: {
    code: 'AUTH_EXPIRED',
    status: 401,
    userMessage: 'Your session has expired',
    suggestion: 'Please log in again to continue',
    errorAction: 'REDIRECT_TO_LOGIN',
  },

  SERVER_ERROR: {
    code: 'SERVER_ERROR',
    status: 500,
    userMessage: 'Something went wrong',
    suggestion: 'Our team has been notified. Please try again in a few minutes.',
    errorAction: 'RETRY_LATER',
  },

  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    status: 429,
    userMessage: 'Too many attempts',
    suggestion: 'Please wait a moment before trying again',
    errorAction: 'WAIT_AND_RETRY',
  },
};

const VALID_CATEGORIES = new Set([
  'Fashion',
  'Food & drink',
  'Beauty',
  'Home & garden',
  'Electronics',
  'Sports',
  'Health',
  'Arts & crafts',
  'Other',
]);

/**
 * @param {keyof typeof StoreCreationError | { code?: string }} error
 * @param {{ storeName?: string }} [context]
 */
export function formatErrorResponse(error, context = {}) {
  const errorKey =
    typeof error === 'string'
      ? error
      : error?.code && StoreCreationError[error.code]
        ? error.code
        : 'SERVER_ERROR';
  const errorConfig = StoreCreationError[errorKey] ?? StoreCreationError.SERVER_ERROR;

  const message =
    typeof errorConfig.userMessage === 'function'
      ? errorConfig.userMessage(context.storeName ?? '')
      : errorConfig.userMessage;
  const suggestion =
    typeof errorConfig.suggestion === 'function'
      ? errorConfig.suggestion(context.storeName ?? '')
      : errorConfig.suggestion;

  return {
    ok: false,
    error: errorConfig.code,
    message,
    suggestion,
    errorAction: errorConfig.errorAction,
    status: errorConfig.status,
    ...(errorConfig.field ? { field: errorConfig.field } : {}),
  };
}

/**
 * Build intake-compatible duplicate_store payload (success:true keeps routing).
 * Returns structured facts only — call `explainDuplicateStoreIntakeResponse` for natural language.
 *
 * @param {string} storeName
 * @param {{ id?: string | null; name?: string | null } | null} [existingStore]
 */
export function formatDuplicateStoreIntakeResponse(storeName, existingStore = null) {
  const displayName =
    String(existingStore?.name ?? storeName ?? '').trim() || 'This store';
  const storeId =
    existingStore?.id != null && String(existingStore.id).trim()
      ? String(existingStore.id).trim()
      : null;
  const fact = FactBuilder.duplicateStore(storeId, displayName);
  return buildIntakePayloadFromFact(fact, { explanation: null }, {
    success: true,
    action: 'duplicate_store',
    businessName: displayName,
    storeId,
    existingStoreId: storeId,
    existingStoreName: displayName,
    error: StoreCreationError.DUPLICATE_STORE.code,
    errorAction: 'OPEN_EXISTING_STORE',
    field: StoreCreationError.DUPLICATE_STORE.field,
  });
}

/**
 * @param {string} storeName
 * @param {{ id?: string | null; name?: string | null } | null} [existingStore]
 * @param {Record<string, unknown>} [context]
 */
export async function explainDuplicateStoreIntakeResponse(storeName, existingStore = null, context = {}) {
  const displayName =
    String(existingStore?.name ?? storeName ?? '').trim() || 'This store';
  const storeId =
    existingStore?.id != null && String(existingStore.id).trim()
      ? String(existingStore.id).trim()
      : null;
  const fact = FactBuilder.duplicateStore(storeId, displayName);
  const { explainFactForIntake } = await import('../response/intakeFactResponse.js');
  return explainFactForIntake(fact, context, {
    success: true,
    action: 'duplicate_store',
    businessName: displayName,
    storeId,
    existingStoreId: storeId,
    existingStoreName: displayName,
    error: StoreCreationError.DUPLICATE_STORE.code,
    errorAction: 'OPEN_EXISTING_STORE',
    field: StoreCreationError.DUPLICATE_STORE.field,
  });
}

/**
 * Validate store creation fields; returns structured field errors for inline UI.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Array<{ field: string; message: string; code: string; suggestion?: string; errorAction?: string }>}
 */
export function validateStoreCreationFields(payload = {}) {
  const errors = [];
  const envelope = payload?.storeCreateForm;
  let name =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? envelope.storeName ?? envelope.businessName
      : payload?.storeName ?? payload?.businessName;
  name = name != null ? String(name).trim() : '';
  let location =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? envelope.location
      : payload?.location;
  location = location != null ? String(location).trim() : '';
  const categoryRaw =
    envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? envelope.category ?? envelope.storeType ?? envelope.businessType
      : payload?.category ?? payload?.storeType ?? payload?.businessType;
  const category = categoryRaw != null ? String(categoryRaw).trim() : '';

  if (!name || name.length < 2) {
    const cfg = StoreCreationError.MISSING_NAME;
    errors.push({
      field: cfg.field,
      message: cfg.userMessage,
      code: cfg.code,
      suggestion: cfg.suggestion,
      errorAction: cfg.errorAction,
    });
  } else if (name.length > 50) {
    errors.push({
      field: 'storeName',
      message: 'Store name must be less than 50 characters',
      code: 'MISSING_NAME',
      suggestion: StoreCreationError.MISSING_NAME.suggestion,
      errorAction: StoreCreationError.MISSING_NAME.errorAction,
    });
  }

  if (!location || location.length < 2) {
    const cfg = StoreCreationError.MISSING_LOCATION;
    errors.push({
      field: cfg.field,
      message:
        location && location.length > 0
          ? 'Please enter a full city or suburb name (e.g. Melbourne)'
          : cfg.userMessage,
      code: cfg.code,
      suggestion: cfg.suggestion,
      errorAction: cfg.errorAction,
    });
  }

  if (!category) {
    const cfg = StoreCreationError.MISSING_CATEGORY;
    errors.push({
      field: cfg.field,
      message: cfg.userMessage,
      code: cfg.code,
      suggestion: cfg.suggestion,
      errorAction: cfg.errorAction,
    });
  } else if (!VALID_CATEGORIES.has(category)) {
    const cfg = StoreCreationError.INVALID_CATEGORY;
    errors.push({
      field: cfg.field,
      message: cfg.userMessage,
      code: cfg.code,
      suggestion: cfg.suggestion,
      errorAction: cfg.errorAction,
    });
  }

  return errors;
}

/**
 * @param {Array<{ field: string; message: string; code?: string; suggestion?: string; errorAction?: string }>} fieldErrors
 */
export function formatValidationErrorResponse(fieldErrors) {
  const fact = FactBuilder.validationError(fieldErrors);
  const primary = fieldErrors[0];
  return buildIntakePayloadFromFact(fact, { explanation: null }, {
    success: false,
    action: 'validation_error',
    error: primary?.code ?? 'VALIDATION_ERROR',
    errorAction: primary?.errorAction,
    field: primary?.field,
    errors: fieldErrors.map(({ field, message, code, suggestion, errorAction }) => ({
      field,
      message,
      ...(code ? { code } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(errorAction ? { errorAction } : {}),
    })),
  });
}

/**
 * @param {Array<{ field: string; message: string; code?: string; suggestion?: string; errorAction?: string }>} fieldErrors
 * @param {Record<string, unknown>} [context]
 */
export async function explainValidationErrorResponse(fieldErrors, context = {}) {
  const fact = FactBuilder.validationError(fieldErrors);
  const primary = fieldErrors[0];
  const { explainFactForIntake } = await import('../response/intakeFactResponse.js');
  return explainFactForIntake(fact, context, {
    success: false,
    action: 'validation_error',
    error: primary?.code ?? 'VALIDATION_ERROR',
    errorAction: primary?.errorAction,
    field: primary?.field,
    errors: fieldErrors.map(({ field, message, code, suggestion, errorAction }) => ({
      field,
      message,
      ...(code ? { code } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(errorAction ? { errorAction } : {}),
    })),
  });
}
