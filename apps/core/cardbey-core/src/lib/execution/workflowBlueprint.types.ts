/**
 * Declarative workflow blueprint schema (Phase 5).
 * JSON blueprints under `blueprints/` conform to these types.
 */

export type BlueprintLocale = 'en' | 'vi' | string;

export type LocalizedString = Partial<Record<BlueprintLocale, string>> & { en: string };

export type BlueprintCheckpointOptionItem = {
  value: string;
  displayLabel: LocalizedString;
};

export type BlueprintCheckpointConfig = {
  type: 'checkpoint';
  outputKey: string;
  prompts: LocalizedString;
  optionItems: BlueprintCheckpointOptionItem[];
  dynamicOptions?: string;
};

export type BlueprintConditionalConfig = {
  type: 'conditional';
  condition: string;
  ifTrueTool: string;
  ifFalseTool: string;
  ifTrueInput?: Record<string, unknown>;
  ifFalseInput?: Record<string, unknown>;
};

export type BlueprintActionConfig = {
  type?: 'action';
};

export type BlueprintStepConfig =
  | BlueprintCheckpointConfig
  | BlueprintConditionalConfig
  | BlueprintActionConfig
  | Record<string, unknown>;

export type WorkflowBlueprintStep = {
  id: string;
  orderIndex: number;
  stepKind: 'action' | 'checkpoint' | 'conditional' | 'parallel';
  toolName: string;
  labels: LocalizedString;
  config?: BlueprintStepConfig;
  inputJson?: Record<string, unknown>;
};

/**
 * Declarative workflow blueprint document (versioned JSON).
 */
export type WorkflowBlueprint = {
  id: string;
  name: string;
  /** Semantic version, e.g. "1.0.0" */
  version: string;
  missionType: string;
  steps: WorkflowBlueprintStep[];
  metadata?: Record<string, unknown>;
};

/**
 * Materialized pipeline step row shape (MissionPipelineStep / getStructuredMissionSteps).
 */
export type MaterializedBlueprintStep = {
  orderIndex: number;
  toolName: string;
  label: string;
  stepKind: 'action' | 'checkpoint' | 'conditional';
  configJson?: Record<string, unknown>;
  inputJson?: Record<string, unknown>;
};
