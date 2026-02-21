# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A personal automation system that filters emails, news, and social media, delivering only what matters to Slack. Scripts run in the background using pm2 as cron jobs.

**Core principle:** Important things come to me. I don't go looking for them.

---

## Current state

The project is in **Phase 2** (email agent). Only the scaffolding exists at the root level — no agent code has been written yet. The `agents/`, `shared/`, `config/`, and `logs/` directories still need to be created.

Files currently at the root that will eventually move to `config/`:
- `profile.md` → `config/profile.md` (email classification rules)
- `sources.json` → `config/sources.json` (trend source definitions)

---

## Commands

```bash
# Run agents directly for testing (no pm2)
npm run dev:email       # node agents/email/index.js
npm run dev:trends      # node agents/trends/index.js

# Test shared utilities
npm run test:slack      # node shared/slack.js
npm run test:claude     # node shared/claude.js

# pm2 process management
npm start               # pm2 start ecosystem.config.js
npm run status          # pm2 list
npm run logs            # pm2 logs
pm2 logs email-agent    # logs for a specific agent
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

- **Email agent** (`agents/email/`): OAuth → fetch unread → classify each email → post urgent to `#email-important`, rest to `#email-digest`
- **Trends agent** (`agents/trends/`): RSS + Reddit → summarize → post digest to `#news-digest`

### pm2 scheduling

Agents are **cron jobs**, not servers. They run once per schedule, then exit:
- `email-agent`: every 20 minutes (`*/20 * * * *`)
- `trends-agent`: daily at 7:30am (`30 7 * * *`)

`autorestart: false` is intentional — pm2 only restarts them on schedule, not on crash.

### AI integration

Claude Code CLI is used for classification and summarization — no API key needed:
```js
// Pattern used in shared/claude.js
const result = await exec(`claude -p "${prompt}"`);
```
This requires Claude Code to be installed and authenticated (`claude --version`).

### Persistent state

The email agent tracks processed IDs in `state/email-seen.json` (auto-generated, not committed) to avoid duplicate notifications.

### Behavior configuration

`config/profile.md` (currently `profile.md` at root) defines how emails are classified. It's loaded dynamically each cycle — edit it and `pm2 restart email-agent`, no code changes needed.

Classification output schema:
```json
{
  "classification": "urgent" | "important" | "informational" | "noise",
  "reason": "...",
  "summary": "...",
  "suggested_action": "...",
  "draft_reply": "..."
}
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js ≥18, ES Modules (`import/export`) |
| Process manager | pm2 |
| AI | Claude Code CLI (`claude -p`) |
| Email | Microsoft Graph API + OAuth 2.0 |
| Notifications | Slack Incoming Webhooks |
| Trends | RSS (`rss-parser`) + Reddit API |

---

## Code conventions

- ES Modules throughout (`"type": "module"` in package.json)
- `async/await` everywhere — no callbacks
- `try/catch` around every email/item — one failure must not crash the whole cycle
- Log prefix per agent: `[email-agent]`, `[trends-agent]`
- All secrets from `process.env` — never hardcoded

---

## Slack channels

| Channel | Content |
|---------|---------|
| `#email-important` | Urgent/actionable emails with summary and draft reply |
| `#email-digest` | Daily summary of all other emails |
| `#news-digest` | Morning digest of news and trends |
| `#alerts` | Critical keyword matches |
| `#agent-logs` | Technical agent activity (debugging) |

---

## Environment variables

See `.env.example`. Key variables:

```
MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID / MS_REFRESH_TOKEN  ← Microsoft Graph OAuth
SLACK_WEBHOOK_EMAIL_IMPORTANT / _EMAIL_DIGEST / _NEWS / _ALERTS / _LOGS  ← Slack
EMAIL_LOOKBACK_HOURS=1
```

`MS_REFRESH_TOKEN` is generated on first run via `node agents/email/auth.js`.
