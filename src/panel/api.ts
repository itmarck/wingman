import { useCallback, useEffect, useState } from 'react';
import { confirm } from './ui';

/** Call the same API as the launcher; the browser adds the Authorization header. */
export async function api<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown,
  background = false,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      // Automatic refreshes are not user actions, so telemetry skips them.
      ...(background && { 'X-Background': '1' }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data?.error?.message ?? `HTTP ${response.status}`), {
      field: data?.error?.field as string | undefined,
    });
  return data as T;
}

/** Load data, optionally refreshing it periodically. */
export function useData<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const load = useCallback(
    async (background: boolean) => {
      if (!path) return;
      try {
        setData(await api<T>(path, 'GET', undefined, background));
        setError(undefined);
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [path],
  );
  const reload = useCallback(() => load(false), [load]);
  useEffect(() => {
    void load(false);
    if (!refreshMs) return;
    const timer = setInterval(() => load(true), refreshMs);
    return () => clearInterval(timer);
  }, [load, refreshMs]);
  return { data, error, reload };
}

export type Catalog = {
  areas: Record<string, string>;
  kinds: string[];
  contexts: Record<string, string>;
  fieldTypes: string[];
  recordColumns: string[];
  settings: Record<
    string,
    { default: string | number; description: string; options: string[] | false }
  >;
};
export type Entry = {
  id: string;
  kind: string;
  title: string;
  text: string;
  editedText: string | null;
  area: string | null;
  parentId: string | null;
  finishedAt: string | null;
  createdAt: string;
};
export type Field = {
  id: string;
  name: string;
  description?: string;
  type: string;
  options?: string[];
  multiple?: boolean;
  collectionId?: string;
};
export type Collection = {
  id: string;
  name: string;
  area: string | null;
  definitions: Record<string, string>;
  fields: Field[];
  records: number;
};
export type RecordRow = Record<string, unknown> & {
  id: string;
  title: string;
  values: Record<string, unknown>;
};
/**
 * Delete an item after confirming. The API only archives it (archivedAt), so it could be
 * restored, but the panel has no view for archived items.
 */
export async function remove(id: string, name: string): Promise<void> {
  if (!(await confirm(`Delete ${name}?`))) return;
  await api('/admin/archive', 'POST', { id, archived: true });
}

export const settingsCollectionId = '00000000-0000-7000-8000-000000000001';
