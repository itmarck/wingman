import {
  CheckCircledIcon,
  ChevronDownIcon,
  ClockIcon,
  CrossCircledIcon,
  ReloadIcon,
  UpdateIcon,
} from '@radix-ui/react-icons';
import { Collapsible } from 'radix-ui';
import type { ReactNode } from 'react';
import { api, useData } from './api';
import { ActionButton, day, Loading, time } from './ui';

type Answer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number };
type Applied = {
  attribute: string;
  value: string | number | null;
  applied: boolean;
  threshold: number;
  answer: Answer;
};
type Attempt = {
  id: number;
  createdAt: string;
  durationMs: number;
  model: string | null;
  request: { state: { preferences: string[] } } | null;
  answers: Record<string, Applied> | null;
  error: string | null;
};
type FlowItem = {
  id: string;
  kind: string;
  title: string;
  status: string;
  source: string;
  area: string | null;
  context: string | null;
  effort: number | null;
  importance: number | null;
  parentId: string | null;
  plannedFor: string | null;
  dueAt: string | null;
  occurredAt: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  nextAttemptAt: string;
  classifications: Attempt[];
};

/** Every capture with the questions sent to JEV, its answers and the attributes applied. */
export function Flow() {
  const { data, error, reload } = useData<FlowItem[]>('/admin/flow?limit=100', 5000);
  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <span className="muted small">Refreshes every 5 seconds</span>
        <ActionButton
          className="button icon"
          label="Refresh"
          icon={<ReloadIcon />}
          action={reload}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <Loading />}
      {data?.length === 0 && <p className="empty">No captures yet.</p>}
      <div className="item-group">
        {data?.map((item) => (
          <FlowCard key={item.id} item={item} reload={reload} />
        ))}
      </div>
    </div>
  );
}

const statusIcons: Record<string, ReactNode> = {
  classified: <CheckCircledIcon />,
  processing: <UpdateIcon />,
  pending: <ClockIcon />,
  failed: <CrossCircledIcon />,
};

function FlowCard({ item, reload }: { item: FlowItem; reload: () => unknown }) {
  const latest = item.classifications[0];
  const facts = {
    area: item.area,
    project: item.parentId,
    context: item.context,
    effort: item.effort,
    importance: item.importance,
    plannedFor: item.plannedFor && day(item.plannedFor),
    dueAt: item.dueAt && time(item.dueAt),
    occurredAt: item.occurredAt && time(item.occurredAt),
  };
  return (
    <Collapsible.Root className="item outline sm">
      <Collapsible.Trigger className="item-trigger">
        <div className="item-content">
          <div className="item-title">{item.title}</div>
          <div className="item-description small">
            {time(item.createdAt)} · {item.source} · {item.attempts} attempt(s)
          </div>
        </div>
        <div className="item-actions">
          <span className="badge">{item.kind}</span>
          <span className={`badge status ${item.status}`}>
            {statusIcons[item.status]}
            {item.status}
          </span>
          <ChevronDownIcon className="chevron" />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content className="item-footer">
        <div className="stack">
          <div className="row small">
            {Object.entries(facts)
              .filter(([, value]) => value != null)
              .map(([key, value]) => (
                <span key={key} className="badge">
                  {key}: {String(value)}
                </span>
              ))}
          </div>
          {item.error && (
            <div className="row">
              <span className="error">{item.error}</span>
              <span className="muted small">next attempt {time(item.nextAttemptAt)}</span>
              <ActionButton
                icon={<ReloadIcon />}
                action={() => api(`/admin/entries/${item.id}/retry`, 'POST')}
                done={reload}
              >
                Retry now
              </ActionButton>
            </div>
          )}
          {latest?.request?.state.preferences.length ? (
            <div className="small">
              <span className="muted">Preferences sent:</span>
              <ul>
                {latest.request.state.preferences.map((preference) => (
                  <li key={preference}>{preference}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {latest?.answers && <Answers answers={latest.answers} />}
          {item.classifications.length > 0 && (
            <div className="small muted">
              {item.classifications.map((c) => (
                <div key={c.id}>
                  {time(c.createdAt)} · {c.durationMs} ms · {c.model ?? '—'}
                  {c.error && <span className="error"> · {c.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Answers({ answers }: { answers: Record<string, Applied> }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer</th>
            <th>Strength</th>
            <th>Applied</th>
            <th>Probabilities</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(answers).map(([id, applied]) => {
            const answer = applied.answer;
            const strength = answer.type === 'noul' ? answer.noul : answer.confidence;
            const shown =
              answer.type === 'choice'
                ? answer.choice
                : answer.type === 'score'
                  ? answer.score.toFixed(2)
                  : answer.noul.toFixed(2);
            return (
              <tr key={id}>
                <td>{id}</td>
                <td>
                  {shown}
                  {applied.value != null && String(applied.value) !== shown && (
                    <span className="muted"> → {String(applied.value)}</span>
                  )}
                </td>
                <td>
                  {strength.toFixed(2)} <span className="muted">≥ {applied.threshold}</span>
                </td>
                <td>{applied.applied ? 'yes' : 'no (NULL)'}</td>
                <td>
                  {'probabilities' in answer &&
                    Object.entries(answer.probabilities)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <div key={key} className="row">
                          <span className="bar">
                            <span style={{ width: `${value * 100}%` }} />
                          </span>
                          <span className="mono">
                            {key.slice(0, 24)} {value.toFixed(2)}
                          </span>
                        </div>
                      ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
