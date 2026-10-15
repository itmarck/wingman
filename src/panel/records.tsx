import { CheckIcon, Cross2Icon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { type KeyboardEvent, useState } from 'react';
import {
  api,
  type Catalog,
  type Collection,
  type Field,
  type RecordRow,
  remove,
  useData,
} from './api';
import { ActionButton, Choice, DateInput, day, Loading, localDay, notify, Tip } from './ui';

const numeric = ['rating', 'amount'];
const temporal = ['occurredAt', 'dueAt'];
const actionsWidth = 88;
/** Fixed width per value type, so switching a row to inputs never moves its text. */
const widths: Record<string, number> = {
  title: 240,
  body: 280,
  text: 200,
  number: 150,
  date: 190,
  boolean: 100,
  select: 180,
  url: 220,
};

type Column = {
  key: string;
  label: string;
  tip?: string;
  type: string;
  field?: Field;
  readOnly?: boolean;
};
type Draft = { columns: Record<string, string>; values: Record<string, unknown> };

const typeOf = (column: string) =>
  numeric.includes(column)
    ? 'number'
    : temporal.includes(column)
      ? 'date'
      : column === 'url'
        ? 'url'
        : column === 'checked'
          ? 'boolean'
          : column;
const widthOf = (column: Column) => widths[column.type] ?? widths.text;

/** The Records of one Collection as a table with the title and the visible columns and fields. */
export function RecordsTable(props: {
  collection: Collection;
  catalog: Catalog;
  /** The Record id being edited, 'new' for a new row, or null. */
  editing: string | null;
  setEditing: (editing: string | null) => void;
  onChanged: () => unknown;
}) {
  const { collection, editing, setEditing } = props;
  const { data, error, reload } = useData<{ records: RecordRow[] }>(
    `/collections/${collection.id}/records`,
  );
  const visible = (key: string) => key === 'title' || collection.visible.includes(key);
  const general = props.catalog.recordColumns.filter(visible);
  const timestamps = props.catalog.readOnlyColumns.filter(visible);
  const columns: Column[] = [
    ...general.map((key) => ({
      key,
      label: collection.definitions[key] ?? key,
      tip: key,
      type: typeOf(key),
    })),
    ...timestamps.map((key) => ({
      key,
      label: collection.definitions[key] ?? key,
      tip: key,
      type: 'date',
      readOnly: true,
    })),
    ...collection.fields
      .filter((field) => field.type !== 'reference' && visible(field.id))
      .map((field) => ({
        key: field.id,
        label: field.name,
        tip: field.description,
        type: field.type,
        field,
      })),
  ];
  const records = data?.records ?? [];
  const cellValue = (record: RecordRow, column: Column) =>
    column.field ? record.values[column.field.id] : record[column.key];
  const span = columns.length + 2;
  const refresh = async () => {
    setEditing(null);
    await reload();
    await props.onChanged();
  };
  return (
    <div className="table-container">
      <table className="table fixed">
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: widthOf(column) }} />
          ))}
          <col />
          <col style={{ width: actionsWidth }} />
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                <ColumnHeader column={column} />
              </th>
            ))}
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {!data && !error && (
            <tr>
              <td colSpan={span}>
                <Loading compact />
              </td>
            </tr>
          )}
          {error && (
            <tr>
              <td colSpan={span} className="error">
                {error}
              </td>
            </tr>
          )}
          {records.map((record) =>
            editing === record.id ? (
              <EditRow
                key={record.id}
                collection={collection}
                columns={columns}
                record={record}
                onCancel={() => setEditing(null)}
                onSaved={refresh}
              />
            ) : (
              <tr key={record.id} onDoubleClick={() => setEditing(record.id)}>
                {columns.map((column) => {
                  const text = display(cellValue(record, column));
                  return (
                    <td key={column.key} title={text}>
                      {column.type === 'url' && text ? (
                        <a className="link" href={text} target="_blank" rel="noreferrer">
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
                <td />
                <td className="actions-cell">
                  <div className="row actions">
                    <Tip label="Edit record">
                      <button
                        className="button icon"
                        type="button"
                        aria-label="Edit record"
                        onClick={() => setEditing(record.id)}
                      >
                        <Pencil1Icon />
                      </button>
                    </Tip>
                    <ActionButton
                      className="button icon"
                      label="Delete record"
                      icon={<TrashIcon />}
                      action={() => remove(record.id, `record "${record.title}"`)}
                      done={refresh}
                    />
                  </div>
                </td>
              </tr>
            ),
          )}
          {data && editing === 'new' && (
            <EditRow
              collection={collection}
              columns={columns}
              onCancel={() => setEditing(null)}
              onSaved={refresh}
            />
          )}
          {data && !records.length && editing !== 'new' && (
            <tr className="empty-row">
              <td colSpan={span}>No records yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ColumnHeader({ column }: { column: Column }) {
  const content = (
    <span className="label-text">
      <span className="truncate">{column.label}</span>
    </span>
  );
  if (!column.tip || column.tip === column.label) return content;
  return (
    <Tip label={column.tip}>
      <span className="tip-target">{content}</span>
    </Tip>
  );
}

function EditRow(props: {
  collection: Collection;
  columns: Column[];
  record?: RecordRow;
  onCancel: () => void;
  onSaved: () => unknown;
}) {
  const { record } = props;
  const general = props.columns.filter((column) => !column.field && !column.readOnly);
  const [draft, setDraft] = useState<Draft>(() => ({
    columns: Object.fromEntries(
      general.map(({ key }) => {
        const value = record?.[key];
        if (value == null) return [key, ''];
        return [key, temporal.includes(key) ? localDay(String(value)) : String(value)];
      }),
    ),
    values: record?.values ?? {},
  }));
  const [pending, setPending] = useState(false);
  const save = async () => {
    const body: Record<string, unknown> = { values: draft.values };
    for (const { key } of general) {
      const value = draft.columns[key]?.trim() ?? '';
      if (key === 'title') body.title = value;
      else if (!value) body[key] = null;
      else if (key === 'checked') body[key] = value === 'true';
      else body[key] = numeric.includes(key) ? Number(value) : value;
    }
    if (record) await api(`/admin/records/${record.id}`, 'PATCH', body);
    else await api(`/collections/${props.collection.id}/records`, 'POST', body);
    await props.onSaved();
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') props.onCancel();
    const typing = (event.target as HTMLElement).tagName === 'INPUT';
    if (event.key === 'Enter' && typing && draft.columns.title?.trim() && !pending) {
      setPending(true);
      save()
        .catch((failure) =>
          notify('Could not save', { detail: (failure as Error).message, error: true }),
        )
        .finally(() => setPending(false));
    }
  };
  const setColumn = (key: string, value: string) =>
    setDraft({ ...draft, columns: { ...draft.columns, [key]: value } });
  return (
    <tr className="edit-row" onKeyDown={keys}>
      {props.columns.map((column) => (
        <td key={column.key}>
          {column.readOnly ? (
            <span className="muted">{display(record?.[column.key])}</span>
          ) : column.field ? (
            <FieldInput
              field={column.field}
              value={draft.values[column.field.id]}
              onChange={(value) =>
                setDraft({ ...draft, values: { ...draft.values, [column.key]: value } })
              }
            />
          ) : column.type === 'boolean' ? (
            // Untouched stays empty, so a new Record keeps null instead of false.
            <input
              className="checkbox"
              type="checkbox"
              checked={draft.columns[column.key] === 'true'}
              onChange={(e) => setColumn(column.key, String(e.target.checked))}
            />
          ) : column.type === 'date' ? (
            <DateInput
              value={draft.columns[column.key] ?? ''}
              onChange={(value) => setColumn(column.key, value)}
            />
          ) : (
            <input
              className="input"
              // biome-ignore lint/a11y/noAutofocus: the first cell of a row being edited
              autoFocus={column.key === 'title'}
              placeholder={column.key === 'title' ? 'Required' : column.label}
              type={column.type === 'number' ? 'number' : 'text'}
              step="any"
              value={draft.columns[column.key] ?? ''}
              onChange={(e) => setColumn(column.key, e.target.value)}
            />
          )}
        </td>
      ))}
      <td />
      <td className="actions-cell">
        <div className="row actions">
          <ActionButton
            className="button icon"
            label="Save"
            icon={<CheckIcon />}
            disabled={!draft.columns.title?.trim()}
            action={save}
          />
          <Tip label="Cancel">
            <button
              className="button icon"
              type="button"
              aria-label="Cancel"
              onClick={props.onCancel}
            >
              <Cross2Icon />
            </button>
          </Tip>
        </div>
      </td>
    </tr>
  );
}

function FieldInput(props: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const { field, value } = props;
  if (field.type === 'boolean')
    return (
      <input
        className="checkbox"
        type="checkbox"
        checked={value === true}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    );
  if (field.type === 'select')
    return (
      <Choice
        value={(value as string) ?? ''}
        options={field.options ?? []}
        onChange={props.onChange}
      />
    );
  if (field.type === 'date')
    return (
      <DateInput
        value={(value as string) ?? ''}
        onChange={(date) => props.onChange(date || null)}
      />
    );
  return (
    <input
      className="input"
      type={field.type === 'number' ? 'number' : 'text'}
      step="any"
      placeholder={field.name}
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        props.onChange(raw === '' ? null : field.type === 'number' ? Number(raw) : raw);
      }}
    />
  );
}

function display(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return day(value);
  return String(value);
}
