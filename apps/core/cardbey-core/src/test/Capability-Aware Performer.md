## Capability-Aware Performer v1

1\. Purpose



Capability-Aware Performer v1 should make Performer able to:



understand a mission

identify what capabilities are required

detect what is missing

choose standard vs premium execution

optionally delegate bounded subtasks

continue execution through the existing Performer runway



This v1 should not replace the current mission spine. It should sit inside the current spine and strengthen it. The audit shows the right place is to extend the Intake V2 kernel plus the existing guarded submission path, not to add a parallel runner.



2\. Non-negotiable architecture rules

2.1 Primary execution runway stays unchanged



All user-driven mission execution must still flow through:



handleSendGuarded

→ handleSend

→ usePerformerConsole.trigger

→ Intake V2 and/or runMissionTrigger



No new UI submission path should bypass this. The audit explicitly flags hidden second-runway risk as high.



2.2 Capability-Aware layer is not a new planner



It must not:



submit directly

call createMissionFromIntent on its own

call spawn APIs from the UI directly

create a second classifier that fights USE\_LLM\_TASK\_PLANNER

2.3 Intake V2 is the kernel to extend



The report identifies performerIntakeV2Routes.js, intakeToolRegistry.js, intakeCapabilityGap.js, and intakeExecutionPolicy.js as the right base.



3\. What v1 should include



v1 should include these subsystems:



capability contract

capability registry adapter

requirement extraction

gap detection result model

execution strategy selector

child-agent request contract

acquisition loop state model

premium routing contract

role + stage context

policy boundaries



It should not yet include:



full autonomous acquisition loop execution

deep RL optimization

full planner replacement

uncontrolled premium auto-routing

4\. Module layout



Use the current core intake kernel as the main home.



Core server modules

apps/core/cardbey-core/src/lib/capabilityAware/

&#x20; types.ts

&#x20; capabilityRegistryAdapter.ts

&#x20; requirementExtractor.ts

&#x20; gapModel.ts

&#x20; strategySelector.ts

&#x20; childAgentContracts.ts

&#x20; acquisitionState.ts

&#x20; premiumRouting.ts

&#x20; roleContext.ts

&#x20; policyGuards.ts

Extend existing intake kernel

apps/core/cardbey-core/src/lib/intake/

&#x20; intakeToolRegistry.js              // existing

&#x20; intakeCapabilityGap.js             // existing

&#x20; intakeExecutionPolicy.js           // existing

&#x20; performerIntakeV2Routes.js         // existing route entry

Dashboard-side read-only helpers

apps/dashboard/cardbey-marketing-dashboard/src/lib/performerCapability/

&#x20; types.ts

&#x20; viewModel.ts



Dashboard should only consume states/results. It should not own capability logic.



5\. Core contracts

5.1 Capability definition

export type CapabilityTier = 'standard' | 'premium';

export type CapabilityExecutor =

&#x20; | 'internal\_tool'

&#x20; | 'internal\_agent'

&#x20; | 'external\_integration'

&#x20; | 'pag\_service'

&#x20; | 'child\_agent';



export type CapabilityStatus =

&#x20; | 'ready'

&#x20; | 'partial'

&#x20; | 'experimental'

&#x20; | 'disabled';



export interface CapabilityDefinition {

&#x20; id: string;

&#x20; name: string;

&#x20; description: string;

&#x20; category: string;

&#x20; tier: CapabilityTier;

&#x20; executor: CapabilityExecutor;

&#x20; status: CapabilityStatus;

&#x20; supportedRoles: string\[];

&#x20; inputs: string\[];

&#x20; outputs: string\[];

&#x20; requiresAuth: boolean;

&#x20; requiresApproval: boolean;

&#x20; supportsGuest: boolean;

&#x20; ppsCost?: number;

&#x20; qualityLevel?: 'low' | 'medium' | 'high' | 'premium';

&#x20; fallbackCapabilityIds?: string\[];

&#x20; substituteFor?: string\[];

&#x20; riskLevel?: 'low' | 'medium' | 'high';

}

5.2 Mission role

export type PerformerRole =

&#x20; | 'business\_launcher'

&#x20; | 'store\_operator'

&#x20; | 'content\_creator'

&#x20; | 'campaign\_manager'

&#x20; | 'research\_agent'

&#x20; | 'buyer\_concierge'

&#x20; | 'generic\_operator';

5.3 Mission phase

export type CapabilityMissionPhase =

&#x20; | 'understand'

&#x20; | 'plan'

&#x20; | 'check\_capabilities'

&#x20; | 'acquire'

&#x20; | 'execute'

&#x20; | 'validate'

&#x20; | 'continue'

&#x20; | 'blocked';

5.4 Requirement

export interface MissionRequirement {

&#x20; id: string;

&#x20; name: string;

&#x20; category: string;

&#x20; requiredFor: string;

&#x20; importance: 'critical' | 'important' | 'optional';

&#x20; expectedOutput: string;

}

5.5 Requirement resolution

export type RequirementState =

&#x20; | 'ready'

&#x20; | 'partial'

&#x20; | 'missing'

&#x20; | 'fetchable'

&#x20; | 'substitutable'

&#x20; | 'delegatable'

&#x20; | 'blocked';



export interface RequirementResolution {

&#x20; requirementId: string;

&#x20; state: RequirementState;

&#x20; matchedCapabilityId?: string;

&#x20; fallbackCapabilityId?: string;

&#x20; suggestedChildRole?: string;

&#x20; requiresUserInput?: boolean;

&#x20; notes?: string;

}

5.6 Execution choice

export type ExecutionMode =

&#x20; | 'standard'

&#x20; | 'premium'

&#x20; | 'fallback'

&#x20; | 'child\_agent'

&#x20; | 'user\_input'

&#x20; | 'blocked';



export interface ExecutionChoice {

&#x20; requirementId: string;

&#x20; chosenMode: ExecutionMode;

&#x20; capabilityId?: string;

&#x20; reason: string;

&#x20; estimatedCost?: number;

&#x20; approvalRequired?: boolean;

}

5.7 Child-agent task

export interface ChildAgentTask {

&#x20; id: string;

&#x20; role: 'research\_child' | 'asset\_child' | 'tooling\_child' | 'validation\_child' | 'reporting\_child';

&#x20; missionId: string;

&#x20; parentRequirementId: string;

&#x20; objective: string;

&#x20; inputs: Record<string, unknown>;

&#x20; expectedOutputs: string\[];

&#x20; maxIterations?: number;

}

5.8 Premium routing policy

export type PremiumUsageMode =

&#x20; | 'standard\_only'

&#x20; | 'suggest\_premium'

&#x20; | 'user\_selected\_premium'

&#x20; | 'auto\_premium\_with\_limit';



export interface PremiumRoutingDecision {

&#x20; allowed: boolean;

&#x20; mode: PremiumUsageMode;

&#x20; recommended: boolean;

&#x20; reason: string;

&#x20; estimatedPpsCost?: number;

}

6\. How each module should work

6.1 types.ts



Contains all canonical types above.



Purpose:



one language for capability-aware execution

no logic

6.2 capabilityRegistryAdapter.ts



Purpose:



unify existing registries without replacing them yet



Inputs:



INTAKE\_TOOL\_REGISTRY

optional adapters for artifact handlers later

optional adapters for action registry later



Outputs:



normalized CapabilityDefinition\[]



Important:

The audit shows multiple registries already exist and are split by concern. This adapter should unify them at read-time first, not rewrite them all at once.



Key exports:



getCapabilityRegistry(): CapabilityDefinition\[]

getCapabilityById(id: string): CapabilityDefinition | undefined

getCapabilitiesForRole(role: PerformerRole): CapabilityDefinition\[]

6.3 requirementExtractor.ts



Purpose:



derive needed mission requirements from current mission context



Inputs:



user intent text

current intent type

current role hint

artifacts involved



Outputs:



MissionRequirement\[]



v1 rule:



deterministic first

simple keyword/context templates

no deep planner competition



Examples:



website intent → website structure, brand, CTA, publish path

campaign intent → goal, target, channel, copy, assets

supplier intent → search, compare, summarize

6.4 gapModel.ts



Purpose:



compare requirements vs capability registry

produce RequirementResolution\[]



Key export:



resolveCapabilityGaps(

&#x20; requirements: MissionRequirement\[],

&#x20; capabilities: CapabilityDefinition\[]

): RequirementResolution\[]



This should extend the spirit of detectCapabilityGap, not replace it blindly. The report says current gap detection exists but is tuned narrowly to intake.



6.5 strategySelector.ts



Purpose:



decide which mode to use per requirement



Inputs:



requirement resolutions

premium policy

role

mission phase



Outputs:



ExecutionChoice\[]



This is where standard vs premium vs child-agent vs fallback gets decided.



Important:

This should complement evaluateExecutionPolicy, not duplicate risk/confidence gating in a conflicting way. The audit shows an execution policy layer already exists and should be extended, not forked.



6.6 childAgentContracts.ts



Purpose:



define bounded child-agent request/result shape

no spawning here



This sits above the existing childAgentBridge.js, which the audit says is real and reusable but not yet a full autonomous framework.



Exports:



createChildAgentTask(...)

validateChildAgentTask(...)

6.7 acquisitionState.ts



Purpose:



model missing capability resolution progress

export type AcquisitionStatus =

&#x20; | 'not\_needed'

&#x20; | 'pending'

&#x20; | 'acquired'

&#x20; | 'substituted'

&#x20; | 'delegated'

&#x20; | 'awaiting\_user'

&#x20; | 'blocked';



export interface CapabilityAcquisitionState {

&#x20; requirementId: string;

&#x20; status: AcquisitionStatus;

&#x20; chosenPath?: ExecutionMode;

&#x20; notes?: string;

}



v1 should only model this state, not fully automate the loop yet.



6.8 premiumRouting.ts



Purpose:



PAG/PPS decision policy layer



Since the audit found no real PAG/PPS product layer in source today, this module should be new and minimal.



Exports:



decidePremiumRouting(...)

isPremiumApprovalRequired(...)

6.9 roleContext.ts



Purpose:



derive current operating role and phase



Inputs:



mission type

current artifact

intent text

execution status



Outputs:



PerformerRole

CapabilityMissionPhase



This extends today’s partial continuation state. The audit says role-aware continuation is only partially present through intentType, mission status, and memory, with no dedicated role model yet.



6.10 policyGuards.ts



Purpose:



central policy decisions for capability-aware actions



Examples:



can guest use this capability?

can this requirement invoke premium?

is child-agent spawn allowed?

is user approval required?



This should align with existing guardrails, not override them.



7\. Integration points

7.1 Server-side primary integration



Primary plug-in point:



performerIntakeV2Routes.js



Why:

The audit identifies Intake V2 as the best existing kernel for registry-like tools, policy, gap detection, and optional child spawn.



Suggested flow inside Intake V2:



input

→ existing classification/validation

→ requirementExtractor

→ capabilityRegistryAdapter

→ gapModel

→ strategySelector

→ existing evaluateExecutionPolicy

→ response:

&#x20;  - clarify

&#x20;  - continue

&#x20;  - propose premium

&#x20;  - suggest child-agent

&#x20;  - execute standard path

7.2 Existing execution gate remains



UI still flows through:



handleSendGuarded

handleSend

usePerformerConsole.trigger



No direct UI submission into capability modules.



7.3 Child-agent execution integration



Use the existing childAgentBridge.js only as executor once policy allows it.



Do not let dashboard components call spawn endpoints directly as part of v1. The audit identifies SpawnChildControls.tsx as manual/operator UI, not the right primary product model.



8\. Role-aware continuation v1



This should work with the new capability layer.



Current state



The audit shows partial pieces already exist:



intentType

active mission status

mission memory

continuation behavior in Performer



But no formal role model.



v1 addition



Use roleContext.ts to choose:



role

phase

requirement template



Examples:



Business launcher



Next steps:



define business type

define offer

generate store/website

review draft

publish

Content creator



Next steps:



define goal

define channel

generate draft

refine

export/publish

Research agent



Next steps:



gather candidates

compare

summarize

recommend action



This role selection is not the planner. It is a continuation context hint for safe sequencing.



9\. Standard vs Premium (PAG/PPS)

v1 policy model



The audit confirms premium/PAG/PPS routing is missing today and should be built fresh.



Decision modes

standard only

suggest premium

user selected premium

auto premium with limit

When to suggest premium



Examples:



premium landing page generation

premium campaign strategy

premium video generation

advanced supplier comparison

high-polish brand copy

Important



PAG should be introduced as a capability tier, not a separate mission runway.



So the same mission can say:



use standard tools

or

upgrade this requirement to premium



That preserves the single runway.



10\. Child-agent model

v1 scope



Use child agents only for bounded sub-goals:



research child

asset child

tooling child

validation child

reporting child

Good v1 examples

gather supplier candidates

find missing assets

evaluate integration options

validate output completeness

Not allowed in v1

child agent owning the whole mission

arbitrary nested spawning

direct child submission from UI

invisible background loops with no mission state

11\. Acquisition loop v1



The audit says a real acquisition loop is missing and should be built fresh.



v1 definition



Do not build a fully autonomous loop yet.



Build:



detect missing requirement

classify as:

fetchable

substitutable

delegatable

awaiting\_user

blocked

record CapabilityAcquisitionState

surface a controlled continuation step



That means v1 acquisition is:



explicit

visible

stateful

not silent



This is enough to avoid immediate mission failure and prepares the real loop later.



12\. Dashboard/UI contract



Dashboard should only consume outputs from the capability-aware layer.



New UI-facing shapes



Add to Performer message/result model:



current role

current phase

missing capabilities summary

premium option available

child-agent recommendation

acquisition state



Do not make dashboard compute these independently.



13\. Policy boundaries



The audit clearly warns about two conflict zones:



hidden second runway

planner/tool allowlist conflict

Lock these rules

Rule 1



Only these can submit user missions:



handleSendGuarded

handleSend

trigger

Intake V2 / runMissionTrigger

Rule 2



Capability-aware modules never submit directly.



Rule 3



USE\_LLM\_TASK\_PLANNER remains authoritative for planner-level classification if enabled.

The capability-aware layer may use primaryMode/role hints, but must not become a competing deep planner.



Rule 4



No direct UI path should call:



createMissionFromIntent

spawn APIs

premium execution path



without going through the central guarded path.



14\. Suggested implementation phases

Phase 0 — contracts only



Build:



all types.ts

capability registry adapter

no behavior change

Phase 1 — read-only capability awareness



Build:



requirement extraction

gap model

role context

view models

no submission changes



Use it to enrich responses and UI only.



Phase 2 — strategy selection



Build:



strategy selector

premium routing policy

child-agent recommendation

acquisition state model



Still no autonomous loop.



Phase 3 — controlled actioning



Allow Intake V2 to:



recommend child-agent spawn

recommend premium upgrade

recommend fallback

recommend user input

through existing response contracts

Phase 4 — bounded acquisition loop



Add explicit “continue until resolved” behavior inside mission state, not as a hidden background runner.



Phase 5 — premium/PAG execution



Only after billing/policy/UI approval contracts are stable.



15\. What to reuse vs what to build fresh

Reuse directly

handleSendGuarded

usePerformerConsole.trigger

runMissionTrigger

missionMemory

performerIntakeV2Routes.js

intakeToolRegistry.js

intakeCapabilityGap.js

intakeExecutionPolicy.js

childAgentBridge.js



These are the strongest reuse candidates in the audit.



Extend carefully

Active mission status

continuation UI

Intake V2 response contracts

child-agent proposal payloads

Build fresh

canonical capability-aware types

registry adapter

premium routing

acquisition state model

role/phase model

explicit standard vs premium policy

real acquisition loop later

16\. Acceptance criteria for v1



Capability-Aware Performer v1 is successful only if:



no new submission runway is introduced

capability definitions can be enumerated from one normalized adapter

requirements can be extracted from an incoming mission

gaps can be modeled in a structured way

strategy can choose standard / premium / fallback / child-agent / user-input

child-agent tasks have a bounded contract

Performer execution still flows through existing guarded paths

planner conflict is avoided

UI receives capability-aware continuation state without owning the logic

17\. Final recommendation



The report says Cardbey is structurally ready at a kernel + spine level and that the safest implementation order is:



contracts

intake kernel extension

policy/gap extension

then premium and acquisition features later.

