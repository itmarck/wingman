import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cross2Icon,
  CrossCircledIcon,
} from '@radix-ui/react-icons';
import { AlertDialog, Dialog, Popover, Select, Toast, Tooltip } from 'radix-ui';
import { createContext, type ReactNode, useContext, useState, useSyncExternalStore } from 'react';

export function Choice(props: {
  value: string;
  options: Record<string, string> | string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows an X that clears the selected value. */
  onClear?: () => void;
}) {
  const entries = Array.isArray(props.options)
    ? props.options.map((option) => [option, option])
    : Object.keys(props.options).map((key) => [key, key]);
  return (
    <Select.Root value={props.value} onValueChange={props.onChange}>
      <Select.Trigger className="select-trigger">
        <Select.Value placeholder={props.placeholder ?? 'Select'} />
        {props.onClear && props.value ? (
          // The trigger opens on pointer down (mouse) or click (touch); the X must not open it.
          <Cross2Icon
            className="select-clear"
            aria-label="Clear"
            onPointerDown={(event) => {
              event.stopPropagation();
              props.onClear?.();
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <Select.Icon>
            <ChevronDownIcon />
          </Select.Icon>
        )}
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={4}>
          <Select.Viewport>
            {entries.map(([value, label]) => (
              <Select.Item key={value} value={value} className="select-item">
                <Select.ItemText>{label}</Select.ItemText>
                <Select.ItemIndicator className="select-indicator">
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** Run an action with a pending state; failures are shown without breaking the view. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<unknown>, done?: () => unknown) => {
    setPending(true);
    try {
      await action();
      await done?.();
    } catch (failure) {
      notify('Action failed', { detail: (failure as Error).message, error: true });
    } finally {
      setPending(false);
    }
  };
  return [pending, run] as const;
}

/** A button that runs an action and shows a spinner in place of its icon meanwhile. */
export function ActionButton(props: {
  action: () => Promise<unknown>;
  done?: () => unknown;
  icon: ReactNode;
  children?: ReactNode;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [pending, run] = useAction();
  const button = (
    <button
      className={props.className ?? 'button'}
      type="button"
      aria-label={props.label}
      disabled={props.disabled || pending}
      onClick={() => run(props.action, props.done)}
    >
      {pending ? <Spinner /> : props.icon}
      {props.children}
    </button>
  );
  if (!props.label || props.children) return button;
  // A disabled button gets no pointer events, so the tooltip listens on a wrapper.
  return (
    <Tip label={props.label}>
      <span className="tip-target">{button}</span>
    </Tip>
  );
}

/** The field of the open form that the last error is about; its Labeled input turns red. */
const FieldError = createContext<{ field?: string; clear: () => void }>({ clear: () => {} });

/**
 * A dialog with a form; it closes when onSubmit resolves. Errors appear in a snackbar, and the
 * field they are about, if shown, is highlighted.
 */
export function FormDialog(props: {
  trigger: ReactNode;
  title: string;
  onSubmit: () => Promise<unknown>;
  onOpen?: () => void;
  tooltip?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [field, setField] = useState<string>();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setField(undefined);
        if (next) props.onOpen?.();
      }}
    >
      {props.tooltip ? (
        <Tip label={props.tooltip}>
          <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
        </Tip>
      ) : (
        <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{props.title}</Dialog.Title>
          <Dialog.Close className="dialog-close" aria-label="Close" disabled={pending}>
            <Cross2Icon />
          </Dialog.Close>
          <form
            className="stack"
            // The server validates; its errors replace the browser's native bubbles.
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setField(undefined);
              try {
                await props.onSubmit();
                setOpen(false);
              } catch (failure) {
                const { message, field } = failure as Error & { field?: string };
                setField(field);
                notify('Could not save', { detail: message, error: true });
              } finally {
                setPending(false);
              }
            }}
          >
            <FieldError.Provider value={{ field, clear: () => setField(undefined) }}>
              {props.children}
            </FieldError.Provider>
            <div className="dialog-footer">
              <Dialog.Close asChild>
                <button className="button" type="button" disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button className="button" type="submit" disabled={pending}>
                {pending && <Spinner />}
                Save
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A form label; `hint` names the expected value type, e.g. "number". `name` is the API
 * property the input sets, so a server error about it highlights the input.
 */
export function Labeled(props: {
  label: string;
  hint?: string;
  name?: string;
  children: ReactNode;
}) {
  const error = useContext(FieldError);
  const invalid = Boolean(props.name) && error.field === props.name;
  return (
    <div
      className="label"
      data-invalid={invalid || undefined}
      // Inputs and Radix selects inside a form both emit change events; editing clears the error.
      onChange={() => invalid && error.clear()}
    >
      <span className="label-text">
        <span className="truncate">{props.label}</span>
        {props.hint && <span className="hint">{props.hint}</span>}
      </span>
      {props.children}
    </div>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');
const isoDay = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const todayIso = () => {
  const now = new Date();
  return isoDay(now.getFullYear(), now.getMonth(), now.getDate());
};
const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** A YYYY-MM-DD value picked from a calendar popup; empty string means no date. */
export function DateInput(props: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = props.value ? day(props.value) : 'Pick a date';
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="select-trigger date-trigger"
          type="button"
          data-placeholder={props.value ? undefined : ''}
        >
          <span className="row" style={{ gap: 8 }}>
            <CalendarIcon />
            {label}
          </span>
          <ChevronDownIcon />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover-content" align="start" sideOffset={4}>
          <Calendar
            value={props.value}
            onSelect={(value) => {
              props.onChange(value);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Calendar(props: { value: string; onSelect: (value: string) => void }) {
  const start = props.value ? new Date(`${props.value}T00:00:00`) : new Date();
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const blanks = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const today = todayIso();
  const move = (delta: number) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };
  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button
          className="button icon"
          type="button"
          aria-label="Previous month"
          onClick={() => move(-1)}
        >
          <ChevronLeftIcon />
        </button>
        <span className="calendar-title">
          {new Date(view.year, view.month, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          className="button icon"
          type="button"
          aria-label="Next month"
          onClick={() => move(1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className="calendar-grid">
        {weekdays.map((day) => (
          <span key={day} className="calendar-weekday">
            {day}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static blanks
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = isoDay(view.year, view.month, i + 1);
          return (
            <button
              key={day}
              type="button"
              className="calendar-day"
              data-selected={day === props.value}
              data-today={day === today}
              onClick={() => props.onSelect(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <button className="button sm" type="button" onClick={() => props.onSelect(today)}>
          Today
        </button>
        <button className="button sm ghost" type="button" onClick={() => props.onSelect('')}>
          Clear
        </button>
      </div>
    </div>
  );
}

/** A UTC instant from the API as readable local text, e.g. "October 11, 2026 at 3:04 PM". */
export function time(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

/** A calendar day (YYYY-MM-DD) or an instant, as readable local date text. */
export function day(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, { dateStyle: 'long' });
}

/** The local calendar day (YYYY-MM-DD) of a UTC instant, for date inputs. */
export function localDay(value: string): string {
  const date = new Date(value);
  return isoDay(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A label shown on hover or focus, for buttons that only have an icon. */
export function Tip(props: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{props.children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" sideOffset={4}>
          {props.label}
          <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The centered progress indicator shown while a page or table loads. */
export function Loading(props: { compact?: boolean }) {
  return (
    <div className={props.compact ? 'loading compact' : 'loading'} aria-busy="true">
      <Spinner />
    </div>
  );
}

type Notice = { id: number; title: string; detail?: string; error?: boolean };
type Question = { message: string; answer: (accepted: boolean) => void };
let feedback: { notices: Notice[]; question?: Question } = { notices: [] };
const listeners = new Set<() => void>();
let lastNotice = 0;
const setFeedback = (next: typeof feedback) => {
  feedback = next;
  for (const listener of listeners) listener();
};

/** Show a snackbar that disappears by itself: a title line and up to two lines of detail. */
export function notify(title: string, options: { detail?: string; error?: boolean } = {}) {
  const notice = { id: ++lastNotice, title, ...options };
  setFeedback({ ...feedback, notices: [...feedback.notices, notice] });
}

/** Ask in a small dialog; resolves true when accepted. */
export function confirm(message: string): Promise<boolean> {
  return new Promise((answer) => setFeedback({ ...feedback, question: { message, answer } }));
}

/** Renders the snackbars and the confirmation dialog once for the whole panel. */
export function Feedback(props: { side: 'left' | 'right' }) {
  const { notices, question } = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => feedback,
  );
  const answer = (accepted: boolean) => {
    question?.answer(accepted);
    setFeedback({ ...feedback, question: undefined });
  };
  return (
    <Toast.Provider duration={5000} swipeDirection={props.side}>
      {notices.map((notice) => (
        <Toast.Root
          key={notice.id}
          className="toast"
          data-error={notice.error || undefined}
          onOpenChange={(open) =>
            !open &&
            setFeedback({ ...feedback, notices: feedback.notices.filter((n) => n !== notice) })
          }
        >
          {notice.error && <CrossCircledIcon className="toast-icon" />}
          <div className="toast-text">
            <Toast.Title className="toast-title">{notice.title}</Toast.Title>
            {notice.detail && (
              <Toast.Description className="toast-detail">{notice.detail}</Toast.Description>
            )}
          </div>
          <Toast.Close className="dialog-close" aria-label="Close">
            <Cross2Icon />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="toast-viewport" data-side={props.side} />
      <AlertDialog.Root open={Boolean(question)} onOpenChange={(open) => !open && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content small" aria-describedby={undefined}>
            <AlertDialog.Title className="dialog-title">{question?.message}</AlertDialog.Title>
            <div className="dialog-footer">
              <AlertDialog.Cancel className="button outline">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className="button destructive" onClick={() => answer(true)}>
                Delete
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Toast.Provider>
  );
}
