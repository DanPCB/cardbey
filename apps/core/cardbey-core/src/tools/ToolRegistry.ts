/**
 * DeepSeek tool registry — registers callable tools and exposes LLM-compatible definitions.
 * Execution delegates to registered handlers (typically dispatchTool / coreTools).
 */

import type {
  Tool,
  ToolDefinition,
  ToolExecutionContext,
  ToolParameter,
  ToolResult,
} from './toolTypes.js';

function parametersToJsonSchema(parameters: ToolParameter[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description,
    };
    if (param.required) required.push(param.name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] overwriting tool "${tool.name}"`);
    }
    this.tools.set(tool.name, tool);
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext = {},
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { ok: false, error: `Tool ${toolName} not found` };
    }

    try {
      return await tool.execute(params ?? {}, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /** Convert to native LLM gateway tool schemas. */
  toLlmToolDefinitions(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return this.getToolDefinitions().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: parametersToJsonSchema(tool.parameters),
    }));
  }
}

let singleton: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!singleton) {
    singleton = new ToolRegistry();
  }
  return singleton;
}

export function resetToolRegistryForTests(): void {
  singleton = null;
}
