# Wingman

Personal automation that filters emails, news, and social media — delivering only what matters to Slack.

The agents are the same in both environments; only the entry point differs:

- **Server (Railway):** `tsx main.js` — long-lived loop, ticks every 5 minutes and decides which agents to run.
- **Local:** `wingman` CLI — runs each agent one-shot, on demand. No scheduler, no background processes.

## Quick setup

```bash
git clone <your-repo> && cd wingman && npm install
wingman setup            # interactive checklist (outlook, notion, slack, schema)
wingman test slack       # verify a connection
wingman run email        # run an agent once
```

Credentials live in `state/secrets.json` and `state/slack.json` (git-ignored).

## Commands

Every command supports `--help` for full details and flags. For example:

```bash
wingman run --help
wingman run email --help
wingman config set --help
```

| Command | Purpose |
|---------|---------|
| `wingman run [agent]` | Run an agent once (`email`, `catchup`, `digest`, `trending`, `inbox`, `all`). No arg lists available agents. |
| `wingman setup [service]` | Configure credentials for a service (`outlook`, `notion`, `slack`, `schema`). No arg shows the checklist. |
| `wingman test [integration]` | Verify a connection (`slack`, `ai`, `notion`). |
| `wingman log` | View today's log with filters. See `--help` for `--yesterday`, `--oneline`, `--tag`, `--filter`, etc. |
| `wingman config` | Inspect, edit, or set configuration files and runtime settings. Subcommands: `show`, `edit`, `get`, `set`, `secret`, `export`. |
| `wingman state` | Inspect state files (`show`) or delete them (`reset <target>`). Credentials are never touched. |

Notion task management is normally done from the web/app. For occasional terminal access there is a standalone script: `tsx scripts/task.js list` / `tsx scripts/task.js add "<text>"`.

## Configuration files

| File | Purpose |
|------|---------|
| `config/profile.md` | Email classification rules |
| `config/goals.md` | Task classification rules and personal goals |
| `config/sources.json` | RSS feeds and Reddit subreddits |

Edit and re-run — they are loaded dynamically.

## State files

Stored in `state/` (git-ignored):

| File | Contents |
|------|---------|
| `state/secrets.json` | OAuth tokens, API keys |
| `state/slack.json` | Slack webhook URLs |
| `state/settings.json` | Thresholds and intervals |
| `state/scheduler.json` | Last-run timestamps (server only) |
| `state/email-seen.json` | Processed email IDs |
| `state/reddit-trending.json` | Notified Reddit posts |
| `state/notion-dbs.json` | Notion database IDs |

## AI provider

Selectable via `AI_PROVIDER`:

| Value | Backend |
|-------|---------|
| `local` (default) | Ollama at `OLLAMA_HOST` |
| `groq` | Groq API |
| `claude` | Claude Code CLI |

```bash
wingman config secret GROQ_API_KEY gsk_...
wingman config secret AI_PROVIDER groq
```

## Scripts

```bash
npm test            # vitest suite
npm run typecheck   # tsc --noEmit
```

## Architecture

See `CLAUDE.md` for agent data flows, classification schemas, and code conventions.
