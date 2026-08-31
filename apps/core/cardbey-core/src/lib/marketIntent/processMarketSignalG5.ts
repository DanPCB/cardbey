import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { MarketSignalG4Result } from './briefTypes.js';
import type { MarketSignalG3Result } from './opportunityTypes.js';
import type { MarketSignalG2Result } from './entityTypes.js';
import type { MarketSignalG5Result, G5Outcome } from './connectionTypes.js';
import { prepareConnectionPlan } from './prepareConnectionPlan.js';
import { saveConnectionPlan } from './connectionStore.js';
import type { ProcessMarketSignalG4Options } from './processMarketSignalG4.js';
import { processMarketSignalG4FromG3 } from './processMarketSignalG4.js';
import { processMarketSignalG3FromG2 } from './processMarketSignalG3.js';
import { processMarketSignalG2 } from './processMarketSignalG2.js';

export type ProcessMarketSignalG5Options = ProcessMarketSignalG4Options & {
  explicitEmail?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  permissionBasis?: string | null;
  emailExecutionAvailable?: boolean;
  forceConnectionPlan?: boolean;
};

export type PrepareConnectionFromG4Input = {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  g2: MarketSignalG2Result;
  g3: MarketSignalG3Result;
  g4: MarketSignalG4Result;
  options?: Omit<ProcessMarketSignalG5Options, keyof ProcessMarketSignalG4Options>;
};

/**
 * Prepare connection plan from G4 result — does not execute.
 */
export function prepareConnectionFromG4(input: PrepareConnectionFromG4Input): MarketSignalG5Result {
  try {
    const { plan, outcome, reason } = prepareConnectionPlan({
      signal: input.signal,
      analysis: input.analysis,
      resolved: input.g2.resolvedEntity,
      research: input.g2.research,
      opportunity: input.g3.opportunity,
      brief: input.g4.brief,
      solution: input.g4.solution,
      explicitEmail: input.options?.explicitEmail,
      leadEmail: input.options?.leadEmail,
      leadPhone: input.options?.leadPhone,
      permissionBasis: input.options?.permissionBasis,
      emailExecutionAvailable: input.options?.emailExecutionAvailable ?? false,
      forcePlan: input.options?.forceConnectionPlan,
    });

    if (plan) {
      saveConnectionPlan(plan);
    }

    return {
      signalId: input.signal.signalId,
      connectionPlan: plan,
      outcome,
      diagnostics: {
        signalId: input.signal.signalId,
        outcome,
        connectionStatus: plan?.connectionStatus ?? null,
        hasContactTarget: Boolean(plan?.recipient.contactTarget),
        executionMode: plan?.executionMode ?? null,
        failureReason: reason ?? null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      signalId: input.signal.signalId,
      connectionPlan: null,
      outcome: 'ASSEMBLY_FAILED',
      diagnostics: {
        signalId: input.signal.signalId,
        outcome: 'ASSEMBLY_FAILED',
        connectionStatus: null,
        hasContactTarget: false,
        executionMode: null,
        failureReason: message,
      },
    };
  }
}

export function processMarketSignalG5FromG4(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  g2: MarketSignalG2Result,
  g3: MarketSignalG3Result,
  g4: MarketSignalG4Result,
  options: ProcessMarketSignalG5Options = {},
): MarketSignalG5Result {
  return prepareConnectionFromG4({ signal, analysis, g2, g3, g4, options });
}

export function processMarketSignalG5FromG2(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  g2: MarketSignalG2Result,
  options: ProcessMarketSignalG5Options = {},
): MarketSignalG5Result {
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
  const g4 = processMarketSignalG4FromG3(signal, analysis, g2, g3, options);
  return processMarketSignalG5FromG4(signal, analysis, g2, g3, g4, options);
}

export async function processMarketSignalG5FromG1(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  options: ProcessMarketSignalG5Options = {},
): Promise<
  MarketSignalG5Result & { g2: MarketSignalG2Result; g3: MarketSignalG3Result; g4: MarketSignalG4Result }
> {
  const g2 = await processMarketSignalG2(signal, analysis, options);
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
  const g4 = processMarketSignalG4FromG3(signal, analysis, g2, g3, options);
  const g5 = processMarketSignalG5FromG4(signal, analysis, g2, g3, g4, options);
  return { ...g5, g2, g3, g4 };
}
