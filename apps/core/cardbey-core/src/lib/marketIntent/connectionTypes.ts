/**
 * G5 — human-approved connection contracts.
 */
import type { AssessmentEvidence } from './opportunityTypes.js';

export type ConnectionChannel =
  | 'EMAIL'
  | 'ORIGINAL_SOCIAL_CONTEXT'
  | 'SOCIAL_PAGE'
  | 'CARDBEY_LINK'
  | 'PARTNER_INTRODUCTION'
  | 'MANUAL_CONTACT'
  | 'OTHER';

export type ConnectionExecutionMode =
  | 'DIRECT_EXECUTABLE'
  | 'MANUAL_HANDOFF'
  | 'PUBLISH_AND_SHARE'
  | 'UNAVAILABLE';

export type ApprovalState =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'BLOCKED';

export type ConnectionStatus =
  | 'PLAN_READY'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTION_PENDING'
  | 'EXECUTED'
  | 'MANUAL_HANDOFF_REQUIRED'
  | 'BLOCKED'
  | 'FAILED'
  | 'CONNECTION_NOT_RECOMMENDED'
  | 'CONTACT_TARGET_UNAVAILABLE'
  | 'CHANNEL_UNAVAILABLE'
  | 'APPROVAL_INVALID'
  | 'REAPPROVAL_REQUIRED';

export type G5Outcome =
  | 'PLAN_READY'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'EXECUTED'
  | 'MANUAL_HANDOFF_REQUIRED'
  | 'CONNECTION_NOT_RECOMMENDED'
  | 'CONTACT_TARGET_UNAVAILABLE'
  | 'CHANNEL_UNAVAILABLE'
  | 'GOVERNANCE_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_INVALID'
  | 'REAPPROVAL_REQUIRED'
  | 'EXECUTION_FAILED'
  | 'DUPLICATE_EXECUTION_PREVENTED'
  | 'NOT_APPLICABLE'
  | 'ASSEMBLY_FAILED';

export interface ContactTarget {
  type: 'email' | 'phone' | 'social_profile' | 'website' | 'manual';
  value: string;
  label: string;
  source: 'g2_research' | 'lead_record' | 'explicit_input' | 'cardbey_account';
  confidence: number;
  verified: boolean;
}

export interface ConnectionMessageDraft {
  subject?: string | null;
  body: string;
  bodyFormat: 'plain' | 'html';
  versionHash: string;
  groundedIn: string[];
  limitations: string[];
}

export interface TrackedDestination {
  url: string;
  label: string;
  attribution: {
    signalId: string;
    connectionPlanId: string;
    opportunityRef?: string | null;
    solutionRef?: string | null;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    cbAttr: string;
  };
}

export interface ConnectionPlan {
  connectionPlanId: string;
  signalId: string;
  opportunityRef: string;
  solutionRef?: string | null;
  objective: string;
  recipient: {
    entityName: string;
    entityRef?: string | null;
    contactTarget: ContactTarget | null;
  };
  recommendedChannel: ConnectionChannel;
  alternativeChannels: ConnectionChannel[];
  contactSource?: string | null;
  permissionBasis?: string | null;
  messageDraft: ConnectionMessageDraft | null;
  valuePrepared: string[];
  trackedDestination: TrackedDestination | null;
  executionMode: ConnectionExecutionMode;
  approvalRequired: boolean;
  governanceStatus: ApprovalState;
  channelAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  connectionStatus: ConnectionStatus;
  proposedAction: 'send_customer_message';
  limitations: string[];
  evidence: AssessmentEvidence[];
  preparedAt: string;
  plannerVersion: string;
}

export interface ConnectionApprovalRecord {
  connectionPlanId: string;
  approvedBy: string;
  approvedAt: string;
  messageVersionHash: string;
  channel: ConnectionChannel;
  recipientValue: string;
  approvalState: 'APPROVED';
}

export interface ConnectionResult {
  connectionPlanId: string;
  signalId: string;
  status: ConnectionStatus;
  outcome: G5Outcome;
  executionMode: ConnectionExecutionMode;
  channel: ConnectionChannel;
  recipient?: string | null;
  externalReference?: string | null;
  executedAt?: string | null;
  executedBy?: string | null;
  idempotencyKey: string;
  duplicatePrevented?: boolean;
  failureReason?: string | null;
  manualHandoff?: {
    message: ConnectionMessageDraft;
    contactTarget: ContactTarget | null;
    trackedDestination: TrackedDestination | null;
    instructions: string;
  } | null;
  attributionContext?: TrackedDestination['attribution'] | null;
}

export interface MarketSignalG5Result {
  signalId: string;
  connectionPlan: ConnectionPlan | null;
  outcome: G5Outcome;
  diagnostics: {
    signalId: string;
    outcome: G5Outcome;
    connectionStatus: ConnectionStatus | null;
    hasContactTarget: boolean;
    executionMode: ConnectionExecutionMode | null;
    failureReason?: string | null;
  };
}

export interface ConnectionExecutionAdapter {
  readonly name: string;
  isEmailChannelAvailable(): boolean;
  sendEmail(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    idempotencyKey: string;
    attributionContext: TrackedDestination['attribution'];
  }): Promise<{ ok: boolean; externalReference?: string | null; error?: string | null; duplicatePrevented?: boolean }>;
}
