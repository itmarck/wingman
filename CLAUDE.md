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
- `agents/email/` — OAuth device-code auth, Microsoft Graph client (read, mark as read, archive, trash), seen-state tracking, orchestrator with grouping logic
- `agents/trends/` — RSS fetcher, Reddit JSON fetcher (unauthenticated), morning digest orchestrator, Reddit trending detector
- `config/profile.md` — email classification rules in Spanish (editable, loaded dynamically)
- `config/sources.json` — trend source definitions (editable, loaded dynamically)
- `scripts/log.js` — log viewer CLI with filtering and oneline mode

**To get started:** fill in `.env` (copy from `.env.example`), run `node agents/email/auth.js` for OAuth, then `npm run dev:all` to test everything.

---

## Commands

```bash
# Scheduler
npm run dev                          # run one tick (respects timing)
npm run dev:all                      # force all agents to run now
node main.js --force-email           # force only email
node main.js --force-digest          # force only morning digest
node main.js --force-trending        # force only Reddit trending
node main.js --force-catchup         # force email catch-up (inbox + junk)

# Individual agents (bypass scheduler)
npm run dev:email                    # email agent only
npm run dev:trends                   # morning digest only
npm run dev:trending                 # Reddit trending only
npm run dev:catchup                  # email catch-up (all unread today)

# Test shared utilities
npm run test:slack                   # verify Slack webhook
npm run test:claude                  # verify Claude CLI

# Log viewer
npm run log                          # today's full log (local time)
npm run log -- oneline               # compact view
npm run log -- ayer                   # yesterday's log
npm run log -- urgente               # only urgent classifications
npm run log -- noise                  # only noise
npm run log -- email                  # only email agent lines
npm run log -- quiet                  # hide verbose lines
npm run log -- ayer oneline           # combinable

# pm2 process management
npm start                            # pm2 start ecosystem.config.js
npm run status                       # pm2 list
npm run logs                         # pm2 logs (live stream)
pm2 restart wingman                  # restart scheduler
pm2 save && pm2 startup              # persist across reboots
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

1. Fetches **all unread emails from today** (inbox + junk/spam folder)
2. Classifies each one via Claude CLI
3. Rescues misclassified junk: if an email in junk is classified as non-noise, moves it to inbox
4. Executes email actions (mark read, archive, trash)
5. Groups and notifies via Slack

Can also be triggered manually with `npm run dev:catchup`.

### Agent data flow

Each agent follows the same pipeline pattern:

```
sources → fetcher → classifier (Claude CLI) → notifier (Slack)
```

- **Email agent** (`agents/email/`): OAuth → fetch unread → filter (isRead + seen.json) → classify each → group similar → post to Slack → execute actions (mark read / archive / trash)
- **Trends digest** (`agents/trends/index.js`): RSS + Reddit → summarize via Claude → post digest to `#news-digest`
- **Reddit trending** (`agents/trends/trending.js`): fetch Reddit → calculate trending score → if above threshold → summarize via Claude → post to `#news-digest`

### Email classification flow

1. Fetch emails from last `EMAIL_LOOKBACK_HOURS` via Microsoft Graph
2. Double filter: skip emails already read in Outlook (`isRead`) + already processed (`state/email-seen.json`)
3. Classify each email via Claude CLI using `config/profile.md` rules
4. Group similar emails by `group_key` (e.g. two login alerts → one Slack message)
5. Post grouped notifications: urgent → `#email-important`, important/info → `#email-digest`, noise → skip
6. Execute email actions: `read` (mark as read), `archive` (mark read + move to archive), `trash` (move to deleted), `none`

### Reddit trending detection

Reddit posts are scored with: `(score × comments) / post_age_hours`

Posts above `REDDIT_TRENDING_THRESHOLD` (default 500) that haven't been notified before are sent through Claude for a brief summary, then posted to `#news-digest`. State tracked in `state/reddit-trending.json` (daily cleanup).

### pm2 scheduling

Single process `wingman` runs as a cron job every 5 minutes. Not a server — runs once per tick, then exits.

`autorestart: false` is intentional — pm2 only restarts on schedule, not on crash.

### AI integration

Claude Code CLI is used for classification and summarization — no API key needed:
```js
const proc = spawn('claude', ['-p', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'] });
proc.stdin.write(prompt);
proc.stdin.end();
```
This requires Claude Code to be installed and authenticated (`claude --version`).

### Logging

Single daily log file at `logs/YYYY-MM-DD.log`. All modules write to the same file with tagged lines:

```
[2026-02-22 00:43:00] [clock ] INFO Tick at 19:43:00 — evaluating agents...
[2026-02-22 00:43:00] [email ] INFO Starting email cycle (lookback: 1h)...
[2026-02-22 00:43:01] [claude] VERBOSE Classify prompt (1823 chars)...
[2026-02-22 00:43:05] [slack ] INFO Slack POST OK (200)
```

- Tags are 6-char fixed width, lowercase
- `info`, `warn`, `error` → terminal + file
- `verbose` → file only (API responses, payloads, raw prompts)
- Terminal shows local time, file stores UTC

Current tags: `clock`, `email`, `trends`, `claude`, `slack`, `auth`

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
  "classification": "urgent | important | informational | noise",
  "reason": "...",
  "summary": "...",
  "suggested_action": "...",
  "draft_reply": "...",
  "group_key": "...",
  "email_action": "read | archive | trash | none"
}
```

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
- Logger tags: 6-char fixed width, lowercase (e.g. `createLogger('email')`)
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
REDDIT_TRENDING_THRESHOLD=500  ← trending score threshold (low=more alerts)
```

`MS_REFRESH_TOKEN` is generated via `node agents/email/auth.js` (device-code flow).
Scope: `Mail.ReadWrite offline_access`. Use `MS_TENANT_ID=consumers` for personal accounts.
