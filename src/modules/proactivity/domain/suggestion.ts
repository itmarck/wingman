import type { AutonomyLevel } from '../../../core/execution/policy.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';

export type SuggestionUrgency = 'low' | 'medium' | 'high' | 'critical';
export type SuggestionStatus =
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

export interface SuggestionFeedback {
  readonly kind: FeedbackKind;
  readonly at: string;
  readonly reviewAt?: string;
  readonly modification?: ComponentValue;
  readonly note?: string;
}

export interface Suggestion {
  readonly id: string;
  readonly fingerprint: string;
  readonly detector: { readonly key: string; readonly version: number };
  readonly subjectItemId?: string;
  readonly relevantState: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly rationale: string;
  readonly expectedEffect: string;
  readonly urgency: SuggestionUrgency;
  readonly expiresAt: string;
  readonly capability: { readonly key: string; readonly version: number };
  readonly autonomy: {
    readonly resolved: AutonomyLevel;
    readonly explicitConsent: boolean;
    readonly safetyCeiling?: AutonomyLevel;
  };
  readonly intentId?: string;
  readonly status: SuggestionStatus;
  readonly createdAt: string;
  readonly feedback: readonly SuggestionFeedback[];
}
