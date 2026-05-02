# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A personal automation system that filters emails, news, and social media, delivering only what matters to Slack. A daemon runs a tick loop every 5 minutes and decides which agents to execute.

**Core principle:** Important things come to me. I don't go looking for them.

---

## Current state

All agents are **implemented and functional**:

- `main.ts` — entry point: initializes Notion databases, then starts the daemon tick loop
- `daemon.ts` — `Daemon` class: `setInterval`-based scheduler, reads/writes `state/scheduler.json`, decides which agents to run each tick
- `cli.ts` — `wingman` CLI binary: loads sub-commands from `cli/` via Commander
- `cli/` — CLI sub-commands: `run`, `log`, `setup`, `config`, `state`, `test`
- `scripts/` — standalone utility programs called by CLI commands or run directly
- `shared/` — reusable infrastructure: logger, Slack client, AI provider, Notion client, config loader, Google API clients
- `shared/ai/` — AI provider abstraction: selects `local`, `groq`, or `claude` based on `AI_PROVIDER` env var
- `agents/email/` — OAuth device-code auth, Microsoft Graph client (read, mark as read, archive, trash, move to folder), seen-state tracking, orchestrator with category-based routing
- `agents/trends/` — RSS fetcher, Reddit JSON fetcher (unauthenticated), morning digest orchestrator, Reddit trending detector
- `agents/tasks/` — Notion inbox processor, schema management, task/subtask creation via AI classification
- `config/profile.md` — email classification rules in Spanish (editable, loaded dynamically)
- `config/goals.md` — task classification rules and personal goals (editable, loaded dynamically)
- `config/sources.json` — trend source definitions (editable, loaded dynamically)

**To get started:** run `wingman setup` to configure credentials, then `wingman run all` to test all agents.

---

## Commands

```bash
# Run agents manually
wingman run              # list available agents
wingman run all          # run all agents sequentially
wingman run email        # run only email agent
wingman run digest       # run only morning digest
wingman run trending     # run only Reddit trending
wingman run catchup      # run email catch-up (inbox + junk, last 2 days)
wingman run inbox        # run only Notion inbox processor

# Log viewer
wingman log              # today's full log (no verb/data)
wingman log -1           # compact view (depth 0 only)
wingman log -y           # yesterday's log
wingman log -v           # include verb (technical) lines
wingman log -d           # include data (payload) lines
wingman log -a           # include everything (verb + data)
wingman log -s           # tick summaries (output.log)
wingman log -t mail      # filter by tag (mail, trnd, clde, slck, task)
wingman log --depth 0    # only top-level lines
wingman log --depth 1    # up to item-level detail
wingman log -e           # only error lines
wingman log -f urgente   # text search

# Setup (run once on a new machine or to re-configure)
wingman setup            # show setup checklist
wingman setup outlook    # Microsoft Graph OAuth (device-code flow)
wingman setup notion     # Notion token + root page ID
wingman setup slack      # Slack webhook URLs per channel
wingman setup schema     # create/sync Notion database schema

# Settings and state
wingman config           # read/write settings (state/settings.json)
wingman state            # inspect or reset runtime state

# Tests
wingman test slack       # verify Slack webhook
wingman test ai          # verify AI provider

# TypeScript
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
```

---

## Architecture

### Two entry points, two programs

The project exposes two distinct programs:

**`main.ts` — the daemon**

Initializes Notion databases once, then starts the `Daemon` class which runs a `setInterval` tick loop every 5 minutes. Meant to run as a long-lived background process (e.g. via pm2 or any process manager).

**`cli.ts` — the `wingman` binary**

Commander-based CLI that loads sub-commands from `cli/`. Used interactively by the developer. `wingman run` can execute any agent on demand, bypassing the daemon's timing logic entirely.

### Daemon tick loop

`daemon.ts` runs `tick()` every 5 minutes. Each tick:

1. Reads `state/scheduler.json` for last execution timestamps
2. Calls `buildPlan()` to decide which agents to run (based on intervals and time-of-day rules)
3. Runs each planned agent sequentially (to avoid overloading the AI provider)
4. Updates timestamps in `state/scheduler.json`

Agent schedule (configured in `main.ts`):
- **Email**: every 15 min
- **Morning digest**: once per day at 8:00am local time
- **Reddit trending**: every 10 min
- **Morning catch-up**: once per day at 8:00am (catches emails from overnight)
- **Notion inbox**: every tick (runs constantly)

### Email catch-up

Runs automatically at 8am each day instead of the normal email cycle:

1. Fetches **all unread emails from the last 2 days** (inbox + junk/spam folder)
2. Classifies each one via the AI provider
3. Rescues misclassified junk: if an email in junk is classified as non-noise, moves it to inbox
4. Executes email actions (folder moves, archive, trash)
5. Marks ALL processed emails as read
6. Routes notifications to Slack (respecting category-specific rules)

Can also be triggered manually with `wingman run catchup`.

### Agent data flow

Each agent follows the same pipeline pattern:

```
sources → fetcher → classifier (AI provider) → notifier (Slack)
```

- **Email agent** (`agents/email/`): OAuth → fetch unread → filter (isRead + seen.json) → classify each (with category) → execute actions (folder moves / archive / trash) → mark all as read → route notifications by category to Slack
- **Trends digest** (`agents/trends/index.ts`): RSS + Reddit → summarize via AI → post digest to `#news-digest`
- **Reddit trending** (`agents/trends/trending.ts`): fetch Reddit → calculate trending score → if above threshold → summarize via AI → post to `#news-digest`
- **Task inbox** (`agents/tasks/inbox.ts`): fetch pending Notion inbox items → classify via AI using `config/goals.md` → create task with subtasks in Notion → mark inbox item as processed

### AI provider abstraction

`shared/ai/index.ts` selects one of three providers based on the `AI_PROVIDER` environment variable (default: `local`):

| Provider | Env value | Notes |
|----------|-----------|-------|
| Local LLM | `local` | Ollama or similar, no API key needed |
| Groq | `groq` | Requires `GROQ_API_KEY` |
| Claude | `claude` | Requires `ANTHROPIC_API_KEY` |

All agents call `classify()`, `classifyRaw()`, or `summarize()` from `shared/ai/index.ts` — they don't know which provider is active. Switching providers requires no code changes, only the env var.

### Configuration loading

There is no `.env` file. `shared/env.js` → `loadConfig()` reads three JSON files from `state/` at startup and injects them into `process.env`:

| File | Contains | Notes |
|------|----------|-------|
| `state/secrets.json` | API keys, OAuth tokens | chmod 600 on Linux |
| `state/settings.json` | Settings (lookback hours, thresholds, etc.) | Keys mapped to uppercase env vars |
| `state/slack.json` | Slack webhook URLs | Mapped to `SLACK_WEBHOOK_*` env vars |

On Railway or Docker, env vars set on the platform always win over these files. This makes the project work identically in both environments without any code changes.

`wingman setup` writes to these files interactively. They are in `.gitignore`.

### Notion task management

The task system uses 4 Notion databases managed by `agents/tasks/schema.ts` and `agents/tasks/database.ts`. The schema is defined using JS native types and expanded to Notion API format at runtime:

```js
// Schema shorthand → Notion API expansion
Boolean    → { checkbox: {} }
Number     → { number: { format: 'number' } }
String     → { rich_text: {} }
Date       → { date: {} }
['a','b']  → { select: { options: [{name:'a'}, {name:'b'}] } }
Rel('Db')  → { relation: { database_id, single_property: {} } }

// Auto-added to all databases:
// name (title), created (created_time), updated (last_edited_time)
```

Shared options (`GOALS`, `CONTEXTS`) are defined once as arrays and referenced by multiple databases.

**Numeric property model** — priority, energy, and progress use 0–100 numbers instead of text labels:

| Property | Scale | Purpose |
|----------|-------|---------|
| `progress` | 0=pending, 1–99=in_progress, 100=done | Replaces status select, propagates up (subtask → task → project) |
| `priority` | 0=none, 1–25=low, 26–50=medium, 51–75=high, 76–100=critical | Continuous ranking, sortable |
| `energy` | 0–25=quick, 26–50=moderate, 51–75=significant, 76–100=deep work | Effort estimation |

**Database structure:**

| Database | Key properties | Relations |
|----------|---------------|-----------|
| Projects | active, progress, goal, context, description | — |
| Tasks | priority, energy, progress, goal, context, due, description | project → Projects |
| Subtasks | progress, order | task → Tasks |
| Inbox | source, status (received/processed/failed) | — |

Creation order matters for relations: Projects → Tasks → Subtasks → Inbox. Database IDs are persisted in `state/notion-dbs.json` and validated on each run (via `daemon.initialize()` at startup).

### Task classification flow

1. Fetch items with status `received` from Inbox database
2. Classify each item via AI provider using `config/goals.md` rules
3. Create task in Tasks database with numeric priority/energy/progress
4. Create subtasks if provided by the AI
5. Mark inbox item as `processed` (or `failed` on error)

Classification output schema:
```json
{
  "type": "task | project | idea",
  "title": "string (Spanish)",
  "description": "string (Spanish)",
  "priority": 0,
  "energy": 50,
  "context": "work | personal | family | brand",
  "goal": "career | english | minima | automation",
  "subtasks": ["step1", "step2"],
  "reasoning": "string (Spanish)"
}
```

### Email classification flow

1. Fetch emails from last `EMAIL_LOOKBACK_HOURS` via Microsoft Graph
2. Double filter: skip emails already read in Outlook (`isRead`) + already processed (`state/email-seen.json`)
3. Classify each email via AI provider using `config/profile.md` rules (returns classification + category + email_action + amount)
4. Execute email actions: `archive`, `trash`, `folder-tickets`, `folder-orders`, `folder-investments`, `read`, `none`
5. Mark ALL processed emails as read (regardless of action)
6. Route notifications based on classification + category:
   - urgent → `#email-important` + mirrored to `#alerts` (phone push)
   - scam → `#email-important` + mirrored to `#alerts` (already trashed)
   - unknown → `#email-digest` as review block
   - tickets / orders → filed silently regardless of amount
   - investment transactions (important) → `#email-digest`
   - important / informational → `#email-digest`
   - noise → no notification

The filter philosophy lives in `config/profile.md` ("Filosofía del filtro"):
Slack should only see things that genuinely add value. Most low-signal
emails (promotions, software updates, receipts, self-initiated config
confirmations) are processed silently and reviewed in Outlook later.

### Email categories and folder routing

| Category | Action | Folder | Notify? |
|----------|--------|--------|---------|
| `security` | read or trash | inbox/deleted | Real alerts → urgent + alerts. Self-initiated config confirmations → silent trash |
| `personal` | read/archive | inbox/archive | If important+ |
| `promotion` | trash/archive | deleted/archive | Only concrete "do X get Y" sweepstakes |
| `software-update` | archive/trash | archive/deleted | Never |
| `ticket` | folder-tickets | Tickets | Never (silent file) |
| `order` | folder-orders | Orders | Never |
| `investment` | folder-investments | Investments | Real transactions only |
| `spam` | trash | deleted | Never |
| `scam` | trash | deleted | Always (important + alerts) |
| `unknown` | none | inbox | Always (for review in digest) |

### Reddit trending detection

Reddit posts are scored with: `(score × comments) / post_age_hours`

Two-tier threshold system:
- **Viral** (`REDDIT_TRENDING_VIRAL`, default 5000): posts above this are always notified regardless of interests — these are massive events too big to miss.
- **Base** (`REDDIT_TRENDING_THRESHOLD`, default 500): posts between base and viral are sent to the AI filtered by `interest_categories` from `config/sources.json`. The AI omits posts that don't match the user's interests.

The AI tags each post as `[VIRAL]` or `[CANDIDATO]` in the prompt. If no posts survive filtering, the AI responds `NINGUNO` and nothing is posted (but posts are still marked as notified to avoid reprocessing).

Slack format: each post is a single bullet with title in Spanish, link in parentheses, and brief summary. No separate header block for each post.

State tracked in `state/reddit-trending.json` (daily cleanup).

### Logging

Two log outputs with distinct roles:

**Daily log** (`logs/YYYY-MM-DD.log`) — detailed structured log with metadata-enriched format:

```
SYMBOL TIMESTAMP [TAG ] LEVEL DD | MESSAGE
```

Example:
```
━━━ 2026-02-22 16:10:21 Tick at 11:10:21 a. m. ━━━━━━━━━━━━━━━━━━━━━━
▸ 2026-02-22 16:10:21 [mail] head 00 | Email cycle (lookback: 1h)
✓ 2026-02-22 16:10:22 [mail] ok   00 | Fetched 5 emails from the last 1h
  2026-02-22 16:10:22 [mail] info 01 |   "Invoice #12345" from Stripe -- important (ticket) [folder-tickets] 250 PEN
  2026-02-22 16:10:22 [mail] info 01 |   "Login alert" from Google -- urgent (security) [read]
· 2026-02-22 16:10:23 [clde] data 00 | Classification result:
· 2026-02-22 16:10:23 [clde] data 01 |   {
· 2026-02-22 16:10:23 [clde] data 01 |     "classification": "important",
· 2026-02-22 16:10:23 [clde] data 01 |     "category": "ticket",
· 2026-02-22 16:10:23 [clde] data 01 |     "email_action": "folder-tickets",
· 2026-02-22 16:10:23 [clde] data 01 |     "amount": 250,
· 2026-02-22 16:10:23 [clde] data 01 |     "amount_currency": "PEN"
· 2026-02-22 16:10:23 [clde] data 01 |   }
· 2026-02-22 16:10:23 [mail] verb 00 | Token refresh OK — expires_in: 3599s
✓ 2026-02-22 16:10:23 [mail] ok   00 | Cycle done: 5 fetched, 3 new — 1 imp, 1 info, 1 noise
```

**Tick summary** (`logs/output.log`) — one line per daemon tick:

```
2026-02-22 11:15:00 Tick — nothing to run
2026-02-22 11:20:00 Tick — email: 3 new (1 imp, 1 info, 1 noise), trending: 0 found
2026-02-22 11:35:00 Tick — digest: posted (30 RSS + 41 Reddit)
```

Log levels (symbol → label → output):
- `━` `tick` — separator bar between daemon ticks (terminal + file)
- `▸` `head` — section headers, agent starts (terminal + file)
- ` ` `info` — details, contextual information (terminal + file)
- `✓` `ok  ` — success confirmations (terminal + file)
- `⚠` `warn` — warnings (terminal + file)
- `✗` `err ` — errors (terminal + file)
- `·` `verb` — technical internals: URLs, token refresh, prompts, stack traces (file only)
- `·` `data` — concrete payloads: API responses, email lists, JSON classifications (file only)

Depth (`DD`): `00` = top-level actions, `01` = individual items (emails, posts, JSON lines), `02` = sub-details.

Tags are 4-char fixed width, lowercase. Terminal shows colored output with chalk; file stores plain text with metadata.

Filtering examples:
- `grep "\[mail\] .* 00"` — only top-level mail summaries
- `grep "info 01"` — only item-level lists
- `grep "\[clde\] data"` — only AI response data
- `grep "verb"` — only technical details

Current tags: `main`, `mail`, `trnd`, `clde`, `slck`, `auth`, `task`, `notn`

### Persistent state

| File | Purpose |
|------|---------|
| `state/scheduler.json` | Last execution timestamps for each agent |
| `state/email-seen.json` | Processed email IDs (max 1000, auto-pruned) |
| `state/reddit-trending.json` | Notified Reddit post IDs (daily cleanup) |
| `state/notion-dbs.json` | Notion database IDs for task system |
| `state/secrets.json` | API keys and OAuth tokens (chmod 600 on Linux) |
| `state/settings.json` | User settings (lookback hours, thresholds, etc.) |
| `state/slack.json` | Slack webhook URLs per channel |

All state files are auto-generated and not committed.

### Behavior configuration

`config/profile.md` defines how emails are classified. `config/goals.md` defines how inbox items are classified into tasks. Both are loaded dynamically each cycle — edit them and restart the daemon, no code changes needed.

Email classification output schema:
```json
{
  "classification": "urgent | important | informational | noise | unknown",
  "category": "security | personal | promotion | software-update | ticket | order | investment | spam | unknown",
  "reason": "...",
  "summary": "...",
  "amount": null,
  "amount_currency": null,
  "group_key": "...",
  "email_action": "read | archive | trash | folder-tickets | folder-orders | folder-investments | none"
}
```

- `classification` determines importance level (which Slack channel, if any)
- `category` determines email type (which folder, notification rules)
- `amount` / `amount_currency` extracted for invoices/payments (used by code to apply threshold)
- Folders (Tickets, Orders, Investments) are auto-created on first use via Graph API
- All processed emails are marked as read after actions complete

All text fields are written in **Spanish** by the AI. English only for proper nouns and technical terms.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (mixed `.ts`/`.js`, executed via `tsx`) |
| Runtime | Node.js ≥18, ES Modules (`import/export`) |
| CLI framework | Commander (`commander`) |
| AI | Pluggable provider: local LLM / Groq / Claude (via `AI_PROVIDER`) |
| Email | Microsoft Graph API + OAuth 2.0 (Mail.ReadWrite) |
| Notifications | Slack Incoming Webhooks |
| Trends | RSS (`rss-parser`) + Reddit JSON (unauthenticated) |
| Tasks | Notion API (`@notionhq/client`) |

---

## Code conventions

- ES Modules throughout (`"type": "module"` in package.json)
- `async/await` everywhere — no callbacks
- `try/catch` around every email/item — one failure must not crash the whole cycle
- Logger tags: 4-char fixed width, lowercase (e.g. `createLogger('mail')`)
- All secrets from `process.env` — never hardcoded
- Slack output in Spanish (Slack mrkdwn format), code and logs in English
- Always pass `windowsHide: true` to every `spawn` / `execSync` / `execFile` call — prevents console windows from flashing on screen while the daemon runs in the background
- **No abbreviations in variable names**. Use full descriptive words. Prefer a single word when the meaning is obvious; otherwise use as many words as needed for clarity. Do NOT use shortened forms like `cfg`, `ctx`, `msg`, `req`, `res`, `addr`, `cmd`, `cnt`, `tmp`, `idx`, `el`, `e`, `err`, `i`, `j` (loop counters are an exception in tight loops) — write `config`, `context`, `message`, `request`, `response`, `address`, `command`, `count`, `temporary`, `index`, `element`, `error`. Domain acronyms are fine (`url`, `id`, `api`, `db`, `json`, `dom`, `oauth`).

---

## Slack channels

| Channel | Content |
|---------|---------|
| `#email-important` | Urgent emails + scam alerts (Spanish) |
| `#email-digest` | Important/informational emails (Spanish) |
| `#news-digest` | Morning digest + Reddit trending alerts (Spanish) |
| `#alerts` | Mirror of anything that needs immediate attention (only unmuted channel — pushes to phone) |
| `#agent-logs` | Technical agent activity (English) |

The user mutes every channel except `#alerts`. Other channels are reviewed
manually a couple of times per day. Any agent that wants to push a
notification to the phone should send the message to its own channel
**and** mirror it to `#alerts` (redundancy is intentional).

---

## Environment variables

All config is stored in `state/secrets.json`, `state/settings.json`, and `state/slack.json`. Use `wingman setup` to configure. Key variables (injected into `process.env` by `loadConfig()` at startup):

```
# Microsoft Graph OAuth (state/secrets.json)
MS_CLIENT_ID
MS_TENANT_ID       ← use "consumers" for personal Microsoft accounts
MS_REFRESH_TOKEN   ← generated by wingman setup outlook

# Notion (state/secrets.json)
NOTION_TOKEN
NOTION_ROOT_PAGE_ID

# AI provider (state/settings.json or platform env)
AI_PROVIDER        ← local | groq | claude (default: local)
GROQ_API_KEY       ← required when AI_PROVIDER=groq
ANTHROPIC_API_KEY  ← required when AI_PROVIDER=claude

# Email settings (state/settings.json)
EMAIL_LOOKBACK_HOURS=1

# Reddit thresholds (state/settings.json)
REDDIT_TRENDING_THRESHOLD=500   ← base score (filtered by interests)
REDDIT_TRENDING_VIRAL=5000      ← viral threshold (always notified)

# Slack webhooks (state/slack.json → mapped to SLACK_WEBHOOK_* vars)
email_important → SLACK_WEBHOOK_EMAIL_IMPORTANT
email_digest    → SLACK_WEBHOOK_EMAIL_DIGEST
news            → SLACK_WEBHOOK_NEWS
alerts          → SLACK_WEBHOOK_ALERTS
logs            → SLACK_WEBHOOK_LOGS
```
