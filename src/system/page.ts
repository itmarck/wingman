export const pageSize = 50;

export interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
  readonly scope: string;
}

export interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor: string | null;
}
