import type { AutonomyLevel } from '../../../core/execution/policy.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';

export type ProactiveUrgency = 'low' | 'medium' | 'high' | 'critical';
export type ProactiveStatus =
  | 'active'
  | 'accepted'
  | 'rejected'
  | 'modified'
  | 'postponed'
  | 'expired'
  | 'completed'
  | 'unsupported';
export type FeedbackKind =
  | 'accepted'
  | 'rejected'
  | 'modified'
  | 'postponed'
  | 'expired'
  | 'completed';

export interface ProactiveFeedback {
  readonly kind: FeedbackKind;
  readonly at: string;
  readonly reviewAt?: string;
  readonly modification?: ComponentValue;
  readonly note?: string;
}

export interface ProactiveProposal {
  readonly id: string;
  readonly fingerprint: string;
  readonly detector: { readonly key: string; readonly version: number };
  readonly subjectItemId?: string;
  readonly relevantState: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly rationale: string;
  readonly expectedEffect: string;
  readonly urgency: ProactiveUrgency;
  readonly expiresAt: string;
  readonly capability: { readonly key: string; readonly version: number };
  readonly autonomy: {
    readonly resolved: AutonomyLevel;
    readonly explicitConsent: boolean;
    readonly safetyCeiling?: AutonomyLevel;
  };
  readonly intentId?: string;
  readonly status: ProactiveStatus;
  readonly createdAt: string;
  readonly feedback: readonly ProactiveFeedback[];
}
