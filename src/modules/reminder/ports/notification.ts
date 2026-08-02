export interface NotificationInput {
  readonly reminderId: string;
  readonly occurrenceId: string;
  readonly subjectItemId: string;
  readonly message: string;
}

export type NotificationResult =
  | { readonly kind: 'delivered'; readonly providerId: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'uncertain'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

/** Provider-independent notification delivery boundary. */
export interface NotificationPort {
  deliver(input: NotificationInput, idempotencyKey: string): Promise<NotificationResult>;
}
