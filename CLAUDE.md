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
- `config/profile.md` — email classification rules in Spanish (editable, loaded dynamically)
- `config/sources.json` — trend source definitions (editable, loaded dynamically)
- `scripts/dev.js` — dev runner CLI (argument-based dispatch: agents, catchup, tests)
- `scripts/log.js` — log viewer CLI with filtering and oneline mode
- `scripts/startup.bat` + `scripts/wingman-task.xml` — Windows Task Scheduler auto-startup on boot and resume from sleep

**To get started:** fill in `.env` (copy from `.env.example`), run `node agents/email/auth.js` for OAuth, then `npm run dev -- all` to test everything.

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

pm2 doesn't natively support `pm2 startup` on Windows. Instead, a Windows Task Scheduler task (`Wingman`) handles persistence:

- **Trigger 1: LogonTrigger** — starts pm2 + wingman when the user logs in (covers shutdown/reboot)
- **Trigger 2: EventTrigger** (Power-Troubleshooter, Event ID 1) — restarts on resume from sleep/suspend

The task runs `scripts/startup.bat`, which waits 10 seconds for system stabilization, cleans any stale pm2 process, and starts fresh via `ecosystem.config.cjs`. `MultipleInstancesPolicy: IgnoreNew` prevents duplicates if both triggers fire simultaneously.

To register (requires admin):
```powershell
Register-ScheduledTask -TaskName 'Wingman' -Xml (Get-Content 'scripts/wingman-task.xml' | Out-String) -Force
```

Task definition lives in `scripts/wingman-task.xml`.

### AI integration

Claude Code CLI is used for classification and summarization — no API key needed:
```js
const proc = spawn('claude', ['-p', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'] });
proc.stdin.write(prompt);
proc.stdin.end();
```
This requires Claude Code to be installed and authenticated (`claude --version`).

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

All state files are auto-generated and not committed.

### Behavior configuration

`config/profile.md` defines how emails are classified. It's loaded dynamically each cycle — edit it and `pm2 restart wingman`, no code changes needed.

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

---

## Code conventions

- ES Modules throughout (`"type": "module"` in package.json)
- `async/await` everywhere — no callbacks
- `try/catch` around every email/item — one failure must not crash the whole cycle
- Logger tags: 4-char fixed width, lowercase (e.g. `createLogger('mail')`)
- All secrets from `process.env` — never hardcoded
- Slack output in Spanish (Slack mrkdwn format), code and logs in English

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
```

`MS_REFRESH_TOKEN` is generated via `node agents/email/auth.js` (device-code flow).
Scope: `Mail.ReadWrite offline_access`. Use `MS_TENANT_ID=consumers` for personal accounts.
