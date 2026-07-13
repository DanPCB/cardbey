import { describe, expect, it } from 'vitest';
import { getToolDefinition } from '../../toolRegistry.js';
import { getExecutor } from '../../toolExecutors/index.js';

const CREATOR_TOOLS = [
  'create_creator_profile',
  'create_creator_content_draft',
  'publish_creator_content',
  'submit_creator_content_for_review',
  'return_creator_content_to_draft',
  'update_creator_content',
  'delete_creator_content',
  'calculate_creator_progress',
];

describe('creator tools in tool registry', () => {
  for (const toolName of CREATOR_TOOLS) {
    it(`registers ${toolName} with executor`, () => {
      const def = getToolDefinition(toolName);
      expect(def, `${toolName} missing from toolRegistry`).toBeTruthy();
      expect(def?.toolName).toBe(toolName);

      const executor = getExecutor(toolName);
      expect(executor, `${toolName} missing executor`).toBeTruthy();
      expect(typeof executor?.execute).toBe('function');
    });
  }
});
