# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A personal automation system that filters emails, news, and social media, delivering only what matters to Slack. A centralized scheduler runs via pm2 every 5 minutes and decides which agents to execute.

**Core principle:** Important things come to me. I don't go looking for them.

---

## Current state

All agents are **implemented and functional**:

- `main.js` — centralized scheduler (tick every 5 min, manages agent timing)
- `shared/` — logger (dual output: terminal + daily log file), Slack webhook helper, Claude CLI wrapper
- `agents/email/` — OAuth device-code auth, Microsoft Graph client (read, mark as read, archive, trash, move to folder), seen-state tracking, orchestrator with category-based routing
- `agents/trends/` — RSS fetcher, Reddit JSON fetcher (unauthenticated), morning digest orchestrator, Reddit trending detector
- `agents/tasks/` — Notion inbox processor, schema management, task/subtask creation via Claude classification
- `config/profile.md` — email classification rules in Spanish (editable, loaded dynamically)
- `config/goals.md` — task classification rules and personal goals (editable, loaded dynamically)
- `config/sources.json` — trend source definitions (editable, loaded dynamically)
- `scripts/dev.js` — dev runner CLI (argument-based dispatch: agents, catchup, tests)
- `scripts/log.js` — log viewer CLI with filtering and oneline mode
- `scripts/setup.js` — one-command setup: registers auto-start on login (no admin) + starts pm2

**To get started:** fill in `.env` (copy from `.env.example`), run `node agents/email/auth.js` for OAuth, then `npm run setup` to start everything, then `npm run dev -- all` to test.

---

## Commands

```bash
# Scheduler
npm run dev                          # run one tick (respects timing)
npm run dev -- all                   # force all agents to run now
npm run dev -- email                 # force only email
npm run dev -- digest                # force only morning digest
npm run dev -- trending              # force only Reddit trending
npm run dev -- catchup               # force email catch-up (inbox + junk)
npm run dev -- test slack            # verify Slack webhook
npm run dev -- test claude           # verify Claude CLI

# Log viewer
npm run log                          # today's full log (no verb/data)
npm run log -- oneline               # compact view (depth 00 only)
npm run log -- ayer                  # yesterday's log
npm run log -- verbose               # include verb (technical) lines
npm run log -- data                  # include data (payload) lines
npm run log -- all                   # include everything (verb + data)
npm run log -- depth 0               # only top-level lines
npm run log -- depth 1               # up to item-level detail
npm run log -- urgente               # only urgent classifications
npm run log -- noise                 # only noise
npm run log -- mail                  # only email agent lines
npm run log -- summary               # show tick summaries (output.log)
npm run log -- ayer oneline          # combinable

# Setup (run once on a new machine)
npm run setup                        # register auto-start + start pm2 (no admin, idempotent)

# pm2 process management
npm start                            # pm2 start ecosystem.config.cjs
npm run status                       # pm2 list
npm run logs                         # pm2 logs (live stream)
pm2 restart wingman                  # restart scheduler
```

---

## Architecture

### Centralized scheduler

`main.js` runs every 5 minutes via pm2 cron. Each tick it:

1. Reads `state/scheduler.json` for last execution timestamps
2. Evaluates which agents should run based on intervals
3. Executes them sequentially (to avoid overloading Claude)
4. Updates timestamps and exits

Agent schedule:
- **Email**: every 15 min (skips 2 ticks)
- **Morning digest**: once per day at 8:00am local time
- **Reddit trending**: every 10 min (skips 1 tick)
- **Email catch-up**: auto-triggers when scheduler detects >60 min gap (e.g. PC was suspended)

The `--force-*` flags bypass timing checks for testing.

### Email catch-up

When the scheduler detects it's been offline for more than 60 minutes (e.g. PC suspended overnight), it automatically runs a catch-up scan instead of the normal email cycle:

1. Fetches **all unread emails from the last 2 days** (inbox + junk/spam folder)
2. Classifies each one via Claude CLI
3. Rescues misclassified junk: if an email in junk is classified as non-noise, moves it to inbox
4. Executes email actions (folder moves, archive, trash)
5. Marks ALL processed emails as read
6. Routes notifications to Slack (respecting category-specific rules)

Can also be triggered manually with `npm run dev -- catchup`.

### Agent data flow

Each agent follows the same pipeline pattern:

```
sources → fetcher → classifier (Claude CLI) → notifier (Slack)
```

- **Email agent** (`agents/email/`): OAuth → fetch unread → filter (isRead + seen.json) → classify each (with category) → execute actions (folder moves / archive / trash) → mark all as read → route notifications by category to Slack
- **Trends digest** (`agents/trends/index.js`): RSS + Reddit → summarize via Claude → post digest to `#news-digest`
- **Reddit trending** (`agents/trends/trending.js`): fetch Reddit → calculate trending score → if above threshold → summarize via Claude → post to `#news-digest`
- **Task inbox** (`agents/tasks/inbox.js`): fetch pending Notion inbox items → classify via Claude using `config/goals.md` → create task with subtasks in Notion → mark inbox item as processed

### Notion task management

The task system uses 4 Notion databases managed by `agents/tasks/schema.js`. The schema is defined using JS native types and expanded to Notion API format at runtime:

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

Creation order matters for relations: Projects → Tasks → Subtasks → Inbox. Database IDs are persisted in `state/notion-dbs.json` and validated on each run.

### Task classification flow

1. Fetch items with status `received` from Inbox database
2. Classify each item via Claude CLI using `config/goals.md` rules
3. Create task in Tasks database with numeric priority/energy/progress
4. Create subtasks if provided by Claude
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
3. Classify each email via Claude CLI using `config/profile.md` rules (returns classification + category + email_action + amount)
4. Execute email actions: `archive`, `trash`, `folder-tickets`, `folder-orders`, `folder-investments`, `read`, `none`
5. Mark ALL processed emails as read (regardless of action)
6. Route notifications based on category-specific rules:
   - urgent → `#email-important`
   - tickets with amount >= 1000 PEN → `#email-digest`
   - tickets under threshold → filed silently
   - orders → filed silently (no notification)
   - investment transactions → `#email-digest`
   - relevant promotions → `#email-digest` (concise discount info)
   - unknown → `#email-digest` as review block
   - noise → no notification

### Email categories and folder routing

| Category | Action | Folder | Notify? |
|----------|--------|--------|---------|
| `security` | read | inbox | Always (urgent) |
| `personal` | read/archive | inbox/archive | If important+ |
| `promotion` | trash/read | deleted/inbox | Only relevant discounts |
| `software-update` | archive | archive | If actively used tool |
| `ticket` | folder-tickets | Tickets | If amount >= 1000 PEN |
| `order` | folder-orders | Orders | Never |
| `investment` | folder-investments | Investments | Transaction confirmations |
| `spam` | trash | deleted | Never |
| `unknown` | none | inbox | Always (for review) |

### Reddit trending detection

Reddit posts are scored with: `(score × comments) / post_age_hours`

Two-tier threshold system:
- **Viral** (`REDDIT_TRENDING_VIRAL`, default 5000): posts above this are always notified regardless of interests — these are massive events too big to miss.
- **Base** (`REDDIT_TRENDING_THRESHOLD`, default 500): posts between base and viral are sent to Claude filtered by `interest_categories` from `config/sources.json`. Claude omits posts that don't match the user's interests.

Claude tags each post as `[VIRAL]` or `[CANDIDATO]` in the prompt. If no posts survive filtering, Claude responds `NINGUNO` and nothing is posted (but posts are still marked as notified to avoid reprocessing).

Slack format: each post is a single bullet with title in Spanish, link in parentheses, and brief summary. No separate header block for each post.

State tracked in `state/reddit-trending.json` (daily cleanup).

### pm2 scheduling

Single process `wingman` runs as a cron job every 5 minutes. Not a server — runs once per tick, then exits.

`autorestart: false` is intentional — pm2 only restarts on schedule, not on crash.

### Windows auto-startup

pm2 doesn't natively support `pm2 startup` on Windows. Instead, `npm run setup` drops a VBScript into the Windows user Startup folder — no admin required, no Task Scheduler.

**How it works:**

`scripts/setup.js` writes `Wingman.vbs` to:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Wingman\Wingman.vbs
```

The VBScript runs via `wscript.exe` (no console window) on every login. It:
1. Waits 10 seconds for system stabilization (`WScript.Sleep 10000`)
2. Cleans any stale pm2 process (`npx pm2 delete wingman`)
3. Starts fresh via `ecosystem.config.cjs`

**Sleep/wake:** pm2 daemon persists across sleep. The cron fires within 5 minutes of wake; if the gap exceeds 60 minutes the catch-up logic handles it automatically.

**`npm run setup` is idempotent** — checks whether the VBScript is up to date and whether wingman is registered in pm2 before doing anything. Safe to re-run anytime.

### AI integration

Claude Code CLI is used for classification and summarization — no API key needed:
```js
const proc = spawn('claude', ['-p', '--output-format', 'text'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
  windowsHide: true,   // prevents console window flash on Windows
});
proc.stdin.write(prompt);
proc.stdin.end();
```
This requires Claude Code to be installed and authenticated (`claude --version`).

On this system `claude` resolves to `C:\Users\Marcelo\.local\bin\claude.exe`.

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

**Tick summary** (`logs/output.log`) — one line per scheduler tick, written by main.js (not pm2):

```
2026-02-22 11:15:00 Tick — nothing to run
2026-02-22 11:20:00 Tick — email: 3 new (1 imp, 1 info, 1 noise), trending: 0 found
2026-02-22 11:35:00 Tick — digest: posted (30 RSS + 41 Reddit)
```

Log levels (symbol → label → output):
- `━` `tick` — separator bar between scheduler ticks (terminal + file)
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
- `grep "\[clde\] data"` — only Claude response data
- `grep "verb"` — only technical details

Current tags: `main`, `mail`, `trnd`, `clde`, `slck`, `auth`

### Persistent state

| File | Purpose |
|------|---------|
| `state/scheduler.json` | Last execution timestamps for each agent |
| `state/email-seen.json` | Processed email IDs (max 1000, auto-pruned) |
| `state/reddit-trending.json` | Notified Reddit post IDs (daily cleanup) |
| `state/notion-dbs.json` | Notion database IDs for task system |

All state files are auto-generated and not committed.

### Behavior configuration

`config/profile.md` defines how emails are classified. `config/goals.md` defines how inbox items are classified into tasks. Both are loaded dynamically each cycle — edit them and `pm2 restart wingman`, no code changes needed.

Classification output schema:
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

All text fields are written in **Spanish** by Claude. English only for proper nouns and technical terms.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js ≥18, ES Modules (`import/export`) |
| Process manager | pm2 |
| AI | Claude Code CLI (`claude -p`) |
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
- Always pass `windowsHide: true` to every `spawn` / `execSync` / `execFile` call — prevents console windows from flashing on screen while the scheduler runs in the background

---

## Slack channels

| Channel | Content |
|---------|---------|
| `#email-important` | Urgent emails with summary (Spanish) |
| `#email-digest` | Important/informational emails (Spanish) |
| `#news-digest` | Morning digest + Reddit trending alerts (Spanish) |
| `#agent-logs` | Technical agent activity (English) |

---

## Environment variables

See `.env.example`. Key variables:

```
MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID / MS_REFRESH_TOKEN  ← Microsoft Graph OAuth
SLACK_WEBHOOK_EMAIL_IMPORTANT / _EMAIL_DIGEST / _NEWS / _ALERTS / _LOGS  ← Slack
EMAIL_LOOKBACK_HOURS=1
REDDIT_TRENDING_THRESHOLD=500  ← base trending score (filtered by interests)
REDDIT_TRENDING_VIRAL=5000     ← viral threshold (always notified, no interest filter)
NOTION_TOKEN=                  ← Notion internal integration token
NOTION_ROOT_PAGE_ID=           ← parent page ID where task databases are created
```

`MS_REFRESH_TOKEN` is generated via `node agents/email/auth.js` (device-code flow).
Scope: `Mail.ReadWrite offline_access`. Use `MS_TENANT_ID=consumers` for personal accounts.
