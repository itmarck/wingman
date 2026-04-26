# Wingman

Personal automation that filters emails, news, and social media — delivering only what matters to Slack. Runs silently in the background via pm2.

## Quick setup

```bash
# 1. Clone and install
git clone <your-repo> && cd wingman && npm install

# 2. Verify Claude Code is installed
claude --version

# 3. Configure services interactively
wingman setup          # shows checklist
wingman setup outlook  # OAuth device-code flow for email
wingman setup notion   # Notion integration token + root page
wingman setup slack    # webhook URLs per channel

# 4. Test connections
wingman test slack
wingman test claude

# 5. Register auto-start and start the scheduler
wingman setup autostart

# 6. Run all agents manually to verify
wingman run all
```

> Credentials are stored in `state/secrets.json` and `state/slack.json` (excluded from git).

## CLI reference

```bash
wingman run [agent]                  # run an agent (no arg = list available)
wingman test [integration]           # test a connection (no arg = list available)
wingman status                       # pm2 status + last run times
wingman log [options]                # view logs (--help for filter options)
wingman config                       # view/edit settings and config files
wingman config secret <KEY> <VALUE>  # write an env var to state/secrets.json
wingman config export [--mask]       # print all config in .env format
wingman setup [service]              # guided setup checklist
wingman stop / start                 # pause/resume the scheduler
wingman teardown / reset             # remove setup or clear state
npm test                             # run vitest suite

```

## Configuration files

| File | Purpose |
|------|---------|
| `config/profile.md` | Email classification rules (edit to tune behavior) |
| `config/goals.md` | Task classification rules and personal goals |
| `config/sources.json` | RSS feeds and Reddit subreddits for trends |

## How it works

A pm2 cron process (`main.js`) ticks every 5 minutes and runs agents on their schedule:

| Agent | Schedule | Output |
|-------|----------|--------|
| Email | every 15 min | `#email-important`, `#email-digest` |
| Reddit trending | every 10 min | `#news-digest` |
| Morning digest | once at 8am | `#news-digest` |
| Inbox (Notion) | every 30 min | Notion tasks |

If the PC was suspended for >60 min, a catch-up scan runs automatically on wake.

## Credentials

Stored in `state/` (git-ignored), never in `.env`:

| File | Contents |
|------|---------|
| `state/secrets.json` | MS OAuth tokens, Notion token |
| `state/slack.json` | Slack webhook URLs |
| `state/settings.json` | Thresholds and intervals |

Run `wingman setup <service>` to configure or reconfigure any of these.

## AI provider

Selectable via `AI_PROVIDER` env var:

| Value | Backend | Use case |
|-------|---------|----------|
| `local` (default) | Ollama at `OLLAMA_HOST` (default `qwen2.5:7b-instruct`) | Local dev |
| `groq` | Groq API (`llama-3.3-70b-versatile`) | Production / Railway |
| `claude` | Claude Code CLI | Legacy / fallback |

```bash
wingman config secret GROQ_API_KEY gsk_...
wingman config secret AI_PROVIDER groq
```

## Full documentation

See `CLAUDE.md` for architecture, agent data flows, and code conventions.
