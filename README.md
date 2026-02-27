# Wingman

A personal automation system that filters emails, news, and social media,
delivering only what matters to Slack. Runs in the background on your main PC using pm2.

## Quick setup

```bash
# 1. Clone and install dependencies
git clone <your-repo>
cd wingman
npm install

# 2. Configure environment variables
cp .env.example .env
# → Edit .env with your credentials

# 3. Make sure Claude Code is installed and authenticated
claude --version

# 4. Authenticate with Microsoft (device-code flow)
node agents/email/auth.js

# 5. Start the scheduler and register auto-start on login
npm run setup

# 6. Test connections
npm run dev -- test slack
npm run dev -- test claude

# 7. Run all agents manually to verify
npm run dev -- all
```

## Commands

```bash
# Scheduler
npm run dev                    # run one tick (respects timing)
npm run dev -- all             # force all agents now
npm run dev -- email           # email agent only
npm run dev -- digest          # morning digest only
npm run dev -- trending        # Reddit trending only
npm run dev -- catchup         # catch-up: all unread today + junk

# Testing
npm run dev -- test slack      # verify Slack webhook
npm run dev -- test claude     # verify Claude CLI

# Log viewer
npm run log                    # view today's log
npm run log -- oneline         # compact view
npm run log -- ayer            # yesterday's log
npm run log -- urgente         # filter by classification
npm run log -- verbose         # include technical lines

# pm2
npm run setup                  # register auto-start + start pm2 (idempotent)
npm start                      # start scheduler (pm2 only, no auto-start)
npm run status                 # check status
npm run logs                   # live log stream
npm run restart                # restart scheduler
```

## Configuration

- `config/profile.md` — email classification rules (edit to tune behavior)
- `config/sources.json` — RSS feeds and Reddit sources for trends
- `.env` — credentials, webhook URLs, and trending thresholds

## Full documentation

See `CLAUDE.md` for architecture, data flow, and code conventions.
