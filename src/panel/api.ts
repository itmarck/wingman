import { useCallback, useEffect, useState } from 'react';

/** Call the same API as the launcher; the browser adds the Authorization header. */
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  return data as T;
}

/** Load data, optionally refreshing it periodically. */
export function useData<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = setInterval(reload, refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);
  return { data, error, reload };
}

export type Catalog = {
  areas: Record<string, string>;
  kinds: string[];
  contexts: Record<string, string>;
  fieldTypes: string[];
  recordColumns: string[];
  settings: Record<string, { default: string | number; description: string }>;
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
  if (!window.confirm(`Delete ${name}?`)) return;
  await api('/admin/archive', 'POST', { id, archived: true });
}

export const settingsCollectionId = '00000000-0000-7000-8000-000000000001';
