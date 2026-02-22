# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A personal automation system that filters emails, news, and social media, delivering only what matters to Slack. Scripts run in the background using pm2 as cron jobs.

**Core principle:** Important things come to me. I don't go looking for them.

---

## Current state

Both agents are **implemented and functional**:

- `shared/` — logger (dual output: terminal + daily log file), Slack webhook helper, Claude CLI wrapper
- `agents/email/` — OAuth device-code auth, Microsoft Graph client (read, mark as read, archive, trash), seen-state tracking, orchestrator with grouping logic
- `agents/trends/` — RSS fetcher, Reddit JSON fetcher (unauthenticated), orchestrator
- `config/profile.md` — email classification rules in Spanish (editable, loaded dynamically)
- `config/sources.json` — trend source definitions (editable, loaded dynamically)
- `scripts/log.js` — log viewer CLI with filtering and oneline mode

**To get started:** fill in `.env` (copy from `.env.example`), run `node agents/email/auth.js` for OAuth, then `npm run dev:email` to test.

---

## Commands

```bash
# Run agents directly for testing (no pm2)
npm run dev:email       # node agents/email/index.js
npm run dev:trends      # node agents/trends/index.js

# Test shared utilities
npm run test:slack      # node shared/slack.js
npm run test:claude     # node shared/claude.js

# Log viewer
npm run log                      # today's full log (local time)
npm run log -- oneline           # compact view
npm run log -- ayer               # yesterday's log
npm run log -- urgente            # only urgent classifications
npm run log -- noise              # only noise
npm run log -- email              # only email agent lines
npm run log -- quiet              # hide verbose lines
npm run log -- ayer oneline       # combinable

# pm2 process management
npm start               # pm2 start ecosystem.config.js
npm run status          # pm2 list
npm run logs            # pm2 logs (live stream)
pm2 restart email-agent # restart one agent
pm2 save && pm2 startup # persist across reboots
```

---

## Architecture

### Agent data flow

Each agent follows the same pipeline pattern:

```
sources → fetcher → classifier (Claude CLI) → notifier (Slack)
```

- **Email agent** (`agents/email/`): OAuth → fetch unread → filter (isRead + seen.json) → classify each → group similar → post to Slack → execute actions (mark read / archive / trash)
- **Trends agent** (`agents/trends/`): RSS + Reddit → summarize via Claude → post digest to `#news-digest`

### Email classification flow

1. Fetch emails from last `EMAIL_LOOKBACK_HOURS` via Microsoft Graph
2. Double filter: skip emails already read in Outlook (`isRead`) + already processed (`state/email-seen.json`)
3. Classify each email via Claude CLI using `config/profile.md` rules
4. Group similar emails by `group_key` (e.g. two login alerts → one Slack message)
5. Post grouped notifications: urgent → `#email-important`, important/info → `#email-digest`, noise → skip
6. Execute email actions: `read` (mark as read), `archive` (mark read + move to archive), `trash` (move to deleted), `none`

### pm2 scheduling

Agents are **cron jobs**, not servers. They run once per schedule, then exit:
- `email-agent`: every 20 minutes (`*/20 * * * *`)
- `trends-agent`: daily at 7:30am (`30 7 * * *`)

`autorestart: false` is intentional — pm2 only restarts them on schedule, not on crash.

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
[2026-02-22 00:43:00] [email ] INFO Starting email cycle...
[2026-02-22 00:43:01] [claude] VERBOSE Classify prompt (1823 chars)...
[2026-02-22 00:43:05] [slack ] VERBOSE Slack POST → https://hooks...
```

- Tags are 6-char fixed width, lowercase
- `info`, `warn`, `error` → terminal + file
- `verbose` → file only (API responses, payloads, raw prompts)
- Terminal shows local time, file stores UTC

Current tags: `email`, `trends`, `claude`, `slack`, `auth`

### Persistent state

The email agent tracks processed IDs in `state/email-seen.json` (auto-generated, not committed) to avoid duplicate notifications.

### Behavior configuration

`config/profile.md` defines how emails are classified. It's loaded dynamically each cycle — edit it and `pm2 restart email-agent`, no code changes needed.

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
- Slack output in Spanish, code and logs in English

---

## Slack channels

| Channel | Content |
|---------|---------|
| `#email-important` | Urgent emails with summary (Spanish) |
| `#email-digest` | Important/informational emails (Spanish) |
| `#news-digest` | Morning digest of news and trends (Spanish) |
| `#agent-logs` | Technical agent activity (English) |

---

## Environment variables

See `.env.example`. Key variables:

```
MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID / MS_REFRESH_TOKEN  ← Microsoft Graph OAuth
SLACK_WEBHOOK_EMAIL_IMPORTANT / _EMAIL_DIGEST / _NEWS / _ALERTS / _LOGS  ← Slack
EMAIL_LOOKBACK_HOURS=1
```

`MS_REFRESH_TOKEN` is generated via `node agents/email/auth.js` (device-code flow).
Scope: `Mail.ReadWrite offline_access`. Use `MS_TENANT_ID=consumers` for personal accounts.
