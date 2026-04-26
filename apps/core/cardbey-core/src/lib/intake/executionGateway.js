/**
 * Execution Gateway — Phase 1.5 (no route wiring).
 *
 * Converts a ReactPlannerDecision into executable system actions.
 *
 * Hard constraints:
 * - No imports from routes/
 * - No SSE wiring
 * - No state mutation / DB calls
 * - Must not bypass injected dispatchTool for execution
 */
 
/**
 * @typedef {{
 *   kind: 'ask';
 *   prompt: string;
 *   options?: unknown[];
 * }} AskDecision
 */
 
/**
 * @typedef {{
 *   kind: 'confirm';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 *   confirmation: Record<string, unknown>;
 * }} ConfirmDecision
 */
 
/**
 * @typedef {{
 *   kind: 'execute';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 * }} ExecuteDecision
 */
 
/**
 * @typedef {{
 *   kind: 'unsupported';
 * }} UnsupportedDecision
 */
 
/**
 * @typedef {AskDecision | ConfirmDecision | ExecuteDecision | UnsupportedDecision} ReactPlannerDecision
 */
 
/**
 * @param {{
 *   decision: ReactPlannerDecision;
 *   context: any;
 *   dispatchTool: (toolName: string, parameters: Record<string, unknown>, context: any) => Promise<any>;
 * }} args
 */
export async function executionGateway({ decision, context, dispatchTool }) {
  switch (decision?.kind) {
    case 'ask':
      return {
        action: 'ask',
        prompt: decision.prompt,
        options: Array.isArray(decision.options) ? decision.options : [],
      };
 
    case 'confirm':
      return {
        action: 'approval_required',
        tool: decision.toolName,
        parameters: decision.parameters,
        confirmation: decision.confirmation,
      };
 
    case 'execute':
      return await dispatchTool(decision.toolName, decision.parameters, context);
 
    case 'unsupported':
      return {
        action: 'chat',
        message: 'I’m not able to perform that action yet.',
      };
 
    default:
      return {
        action: 'chat',
        message: 'I’m not able to perform that action yet.',
      };
  }
}
 
