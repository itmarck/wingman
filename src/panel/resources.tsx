import {
  CheckIcon,
  Pencil1Icon,
  PlusIcon,
  ResetIcon,
  TargetIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { useState } from 'react';
import {
  api,
  type Catalog,
  type Collection,
  type Entry,
  type Field,
  remove,
  settingsCollectionId,
  useData,
} from './api';
import { RecordsTable } from './records';
import {
  ActionButton,
  Choice,
  DateInput,
  FormDialog,
  Labeled,
  Loading,
  Spinner,
  Tip,
  time,
  useAction,
} from './ui';

/** Projects: important goals created only here; Entries join them via parentId. */
export function Projects({ catalog }: { catalog: Catalog }) {
  const [open, setOpen] = useState(true);
  const { data, error, reload } = useData<Entry[]>(`/entries?kind=project&open=${open}&limit=200`);
  const [form, setForm] = useState({ title: '', text: '', area: '' });
  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <Choice
          value={open ? 'open' : 'finished'}
          options={['open', 'finished']}
          onChange={(value) => setOpen(value === 'open')}
        />
        <FormDialog
          title="New project"
          onOpen={() => setForm({ title: '', text: '', area: '' })}
          trigger={
            <button className="button" type="button">
              <PlusIcon /> Project
            </button>
          }
          onSubmit={async () => {
            await api('/admin/projects', 'POST', {
              title: form.title,
              area: form.area,
              ...(form.text.trim() && { text: form.text }),
            });
            await reload();
          }}
        >
          <Labeled label="Title">
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Labeled>
          <Labeled label="Description (helps JEV assign Entries)">
            <textarea
              className="textarea"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
          </Labeled>
          <Labeled label="Area">
            <Choice
              value={form.area}
              options={catalog.areas}
              onChange={(area) => setForm({ ...form, area })}
            />
          </Labeled>
        </FormDialog>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <Loading />}
      {data?.length === 0 && <p className="empty">No projects.</p>}
      <div className="item-group">
        {data?.map((project) => (
          <div key={project.id} className="item outline">
            <div className="item-media">
              <TargetIcon />
            </div>
            <div className="item-content">
              <div className="item-title">
                {project.title} <span className="badge">{project.area}</span>
              </div>
              {project.text !== project.title && (
                <div className="item-description">{project.text}</div>
              )}
              <div className="muted small">
                Created {time(project.createdAt)}
                {project.finishedAt && ` · finished ${time(project.finishedAt)}`}
              </div>
            </div>
            <div className="item-actions">
              <ActionButton
                className="button sm"
                icon={project.finishedAt ? <ResetIcon /> : <CheckIcon />}
                action={() =>
                  api(
                    `/admin/projects/${project.id}/${project.finishedAt ? 'reopen' : 'finish'}`,
                    'POST',
                  )
                }
                done={reload}
              >
                {project.finishedAt ? 'Reopen' : 'Finish'}
              </ActionButton>
              <ActionButton
                className="button icon"
                label="Delete project"
                icon={<TrashIcon />}
                action={() => remove(project.id, `project "${project.title}"`)}
                done={reload}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Collections with their definitions, extra fields and Records. */
export function Collections({ catalog }: { catalog: Catalog }) {
  const { data, error, reload } = useData<Collection[]>('/collections');
  const [selected, setSelected] = useState<string>();
  const collections = data?.filter((c) => c.id !== settingsCollectionId) ?? [];
  const current = collections.find((c) => c.id === selected) ?? collections[0];
  if (!data && !error) return <Loading />;
  return (
    <div className="grid-2">
      <div>
        <div className="list">
          {collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className="list-item"
              data-active={collection.id === current?.id}
              onClick={() => setSelected(collection.id)}
            >
              {collection.name} <span className="count">{collection.records}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <CollectionForm catalog={catalog} onSaved={reload} />
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      {current && (
        <CollectionView
          key={current.id}
          collection={current}
          catalog={catalog}
          onChanged={reload}
        />
      )}
    </div>
  );
}

const examples: Record<string, string> = {
  title: 'e.g. Name',
  subtitle: 'e.g. Director',
  body: 'e.g. Notes',
  category: 'e.g. Genre',
  rating: 'e.g. My rating',
  amount: 'e.g. Price',
  url: 'e.g. Trailer',
  occurredAt: 'e.g. Watched on',
  dueAt: 'e.g. Return by',
};

function CollectionForm(props: {
  catalog: Catalog;
  collection?: Collection;
  onSaved: () => unknown;
}) {
  const empty = {
    name: '',
    area: '',
    definitions: {} as Record<string, string>,
    fields: [] as Field[],
  };
  const [form, setForm] = useState(empty);
  const emptyField = { name: '', description: '', type: 'text', options: '' };
  const [newField, setNewField] = useState(emptyField);
  const setField = (id: string, patch: Partial<Field>) =>
    setForm({
      ...form,
      fields: form.fields.map((field) => {
        if (field.id !== id) return field;
        const next = { ...field, ...patch };
        if (!next.description?.trim()) delete next.description;
        return next;
      }),
    });
  return (
    <FormDialog
      title={props.collection ? `Edit ${props.collection.name}` : 'New collection'}
      onOpen={() =>
        setForm(
          props.collection
            ? { ...structuredClone(props.collection), area: props.collection.area ?? '' }
            : empty,
        )
      }
      trigger={
        <button className="button" type="button">
          {props.collection ? <Pencil1Icon /> : <PlusIcon />}{' '}
          {props.collection ? 'Edit' : 'Collection'}
        </button>
      }
      onSubmit={async () => {
        const definitions = Object.fromEntries(
          Object.entries(form.definitions).filter(([, v]) => v.trim()),
        );
        const body = { name: form.name, area: form.area, definitions, fields: form.fields };
        if (props.collection) await api(`/admin/collections/${props.collection.id}`, 'PATCH', body);
        else await api('/admin/collections', 'POST', body);
        await props.onSaved();
      }}
    >
      <Labeled label="Name (in English)">
        <input
          className="input"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Labeled>
      <Labeled label="Area">
        <Choice
          value={form.area}
          options={props.catalog.areas}
          onChange={(area) => setForm({ ...form, area })}
        />
      </Labeled>
      <section className="form-section">
        <div>
          <h3 className="section-title">Column definitions</h3>
          <p className="section-description">
            What each general column means in this collection. Leave empty the ones it does not use;
            the API always returns every column.
          </p>
        </div>
        <div className="definitions">
          {props.catalog.recordColumns.map((column) => (
            <label key={column} className="definition">
              <span className="mono">{column}</span>
              <input
                className="input"
                placeholder={examples[column]}
                value={form.definitions[column] ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    definitions: { ...form.definitions, [column]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>
      <section className="form-section">
        <div>
          <h3 className="section-title">Extra fields</h3>
          <p className="section-description">
            Data without behavior, stored in values. The definition says what the field means here.
            Removing a field deletes its data.
          </p>
        </div>
        {form.fields.length > 0 && (
          <div className="definitions">
            {form.fields.map((field) => (
              <div key={field.id} className="field-row">
                <input
                  className="input"
                  aria-label="Field name"
                  value={field.name}
                  onChange={(e) => setField(field.id, { name: e.target.value })}
                />
                <input
                  className="input"
                  aria-label="Field definition"
                  placeholder="Definition (optional)"
                  value={field.description ?? ''}
                  onChange={(e) => setField(field.id, { description: e.target.value })}
                />
                <span className="badge">{field.type}</span>
                <Tip label="Remove field">
                  <button
                    className="button icon"
                    type="button"
                    aria-label="Remove field"
                    onClick={() =>
                      setForm({ ...form, fields: form.fields.filter((f) => f.id !== field.id) })
                    }
                  >
                    <TrashIcon />
                  </button>
                </Tip>
                {field.options && (
                  <span className="muted small field-options">
                    Options: {field.options.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="field-row new-field">
          <input
            className="input"
            placeholder="Field name"
            value={newField.name}
            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Definition (optional)"
            value={newField.description}
            onChange={(e) => setNewField({ ...newField, description: e.target.value })}
          />
          <Choice
            value={newField.type}
            options={props.catalog.fieldTypes.filter((type) => type !== 'reference')}
            onChange={(type) => setNewField({ ...newField, type })}
          />
          <Tip label="Add field">
            <span className="tip-target">
              <button
                className="button icon outline"
                type="button"
                aria-label="Add field"
                disabled={!newField.name.trim()}
                onClick={() => {
                  const field: Field = {
                    id: crypto.randomUUID(),
                    name: newField.name.trim(),
                    type: newField.type,
                  };
                  if (newField.description.trim()) field.description = newField.description.trim();
                  if (field.type === 'select')
                    field.options = newField.options
                      .split(',')
                      .map((o) => o.trim())
                      .filter(Boolean);
                  setForm({ ...form, fields: [...form.fields, field] });
                  setNewField(emptyField);
                }}
              >
                <PlusIcon />
              </button>
            </span>
          </Tip>
          {newField.type === 'select' && (
            <input
              className="input field-options"
              placeholder="Options, comma separated"
              value={newField.options}
              onChange={(e) => setNewField({ ...newField, options: e.target.value })}
            />
          )}
        </div>
      </section>
    </FormDialog>
  );
}

function CollectionView(props: {
  collection: Collection;
  catalog: Catalog;
  onChanged: () => unknown;
}) {
  const { collection } = props;
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div style={{ minWidth: 0 }}>
      <div className="row spread toolbar">
        <div className="row">
          <strong>{collection.name}</strong>
          {collection.area && <span className="badge">{collection.area}</span>}
        </div>
        <div className="row">
          <button
            className="button"
            type="button"
            disabled={editing === 'new'}
            onClick={() => setEditing('new')}
          >
            <PlusIcon /> Record
          </button>
          <CollectionForm
            catalog={props.catalog}
            collection={collection}
            onSaved={props.onChanged}
          />
          <ActionButton
            className="button icon"
            label="Delete collection"
            icon={<TrashIcon />}
            action={() => remove(collection.id, `collection "${collection.name}"`)}
            done={props.onChanged}
          />
        </div>
      </div>
      <RecordsTable
        collection={collection}
        catalog={props.catalog}
        editing={editing}
        setEditing={setEditing}
        onChanged={props.onChanged}
      />
    </div>
  );
}

type Preference = { id: string; kind: string; text: string };

/** Natural-language preferences by kind, sent to JEV with each classification. */
export function Preferences({ catalog }: { catalog: Catalog }) {
  const { data, error, reload } = useData<Preference[]>('/admin/preferences');
  const [draft, setDraft] = useState({ kind: 'task', text: '' });
  const [adding, run] = useAction();
  return (
    <div>
      <form
        className="row toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () => api('/admin/preferences', 'POST', draft),
            async () => {
              setDraft({ ...draft, text: '' });
              await reload();
            },
          );
        }}
      >
        <Choice
          value={draft.kind}
          options={catalog.kinds.filter((k) => k !== 'project')}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="e.g. AWS courses belong to employment"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
        <button className="button" type="submit" disabled={!draft.text.trim() || adding}>
          {adding ? <Spinner /> : <PlusIcon />} Add
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {!data && !error && <Loading />}
      {data?.length === 0 && <p className="empty">No preferences yet.</p>}
      {catalog.kinds.map((kind) => {
        const items = data?.filter((p) => p.kind === kind) ?? [];
        if (!items.length) return null;
        return (
          <div key={kind} className="card">
            <div className="card-header">
              <div className="card-title">{kind}</div>
              <div className="card-description">Sent to JEV when classifying a {kind}.</div>
            </div>
            <div className="card-content stack" style={{ gap: 8 }}>
              {items.map((preference) => (
                <PreferenceRow key={preference.id} preference={preference} reload={reload} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreferenceRow({ preference, reload }: { preference: Preference; reload: () => unknown }) {
  const [text, setText] = useState(preference.text);
  return (
    <div className="row">
      <input
        className="input"
        style={{ flex: 1 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ActionButton
        className="button icon"
        label="Save"
        icon={<CheckIcon />}
        disabled={text === preference.text || !text.trim()}
        action={() =>
          api(`/admin/preferences/${preference.id}`, 'PATCH', { kind: preference.kind, text })
        }
        done={reload}
      />
      <ActionButton
        className="button icon"
        label="Delete"
        icon={<TrashIcon />}
        action={() => api(`/admin/preferences/${preference.id}`, 'DELETE')}
        done={reload}
      />
    </div>
  );
}

/** Settings are Records of the system Settings Collection; code defines keys and defaults. */
export function Settings({ catalog }: { catalog: Catalog }) {
  const { data, error, reload } = useData<Record<string, string | number>>('/admin/settings');
  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="item-group">
        {!data && !error && <Loading />}
        {data &&
          Object.entries(catalog.settings).map(([key, definition]) => (
            <SettingRow
              key={key}
              name={key}
              description={definition.description}
              fallback={definition.default}
              value={data[key]}
              reload={reload}
            />
          ))}
      </div>
    </div>
  );
}

function SettingRow(props: {
  name: string;
  description: string;
  fallback: string | number;
  value: string | number;
  reload: () => unknown;
}) {
  const [value, setValue] = useState(String(props.value));
  return (
    <div className="item outline">
      <div className="item-content">
        <div className="item-title mono">{props.name}</div>
        <div className="item-description">
          {props.description} · default {String(props.fallback)}
        </div>
      </div>
      <div className="item-actions">
        <input
          className="input"
          style={{ width: 220 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <ActionButton
          className="button sm"
          icon={<CheckIcon />}
          disabled={value === String(props.value)}
          action={() => api(`/admin/settings/${props.name}`, 'PUT', { value })}
          done={props.reload}
        >
          Save
        </ActionButton>
      </div>
    </div>
  );
}

/** Capture a note or task from the panel, the same way the launcher does. */
export function EntryForm() {
  const empty = { kind: 'note', text: '', plannedFor: '', dueAt: '', occurredAt: '' };
  const [form, setForm] = useState(empty);
  const task = form.kind === 'task';
  return (
    <FormDialog
      title="New entry"
      onOpen={() => setForm(empty)}
      tooltip="New entry"
      trigger={
        <button className="button fab" type="button" aria-label="New entry">
          <PlusIcon />
        </button>
      }
      onSubmit={() =>
        api('/entries', 'POST', {
          kind: form.kind,
          text: form.text,
          submissionKey: crypto.randomUUID(),
          ...(task && form.plannedFor && { plannedFor: form.plannedFor }),
          ...(task && form.dueAt && { dueAt: form.dueAt }),
          ...(!task && form.occurredAt && { occurredAt: form.occurredAt }),
        })
      }
    >
      <Labeled label="Kind">
        <Choice
          value={form.kind}
          options={['note', 'task']}
          onChange={(kind) => setForm({ ...form, kind })}
        />
      </Labeled>
      <Labeled label="Text">
        <textarea
          className="textarea"
          required
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
        />
      </Labeled>
      {task ? (
        <>
          <Labeled label="Planned for">
            <DateInput
              value={form.plannedFor}
              onChange={(plannedFor) => setForm({ ...form, plannedFor })}
            />
          </Labeled>
          <Labeled label="Due">
            <DateInput value={form.dueAt} onChange={(dueAt) => setForm({ ...form, dueAt })} />
          </Labeled>
        </>
      ) : (
        <Labeled label="Occurred on">
          <DateInput
            value={form.occurredAt}
            onChange={(occurredAt) => setForm({ ...form, occurredAt })}
          />
        </Labeled>
      )}
      <p className="muted small">
        Dates left empty are detected from the text (e.g. «mañana», «ayer»).
      </p>
    </FormDialog>
  );
}
