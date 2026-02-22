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

# 3. Install pm2 globally
npm install -g pm2

# 4. Make sure Claude Code is installed and authenticated
claude --version

# 5. Authenticate with Microsoft (device-code flow)
node agents/email/auth.js

# 6. Test connections
npm run test:slack
npm run test:claude

# 7. Run all agents manually to verify
npm run dev:all

# 8. Start the scheduler as a cron job
npm start

# 9. Configure auto-start on boot
pm2 startup
pm2 save
```

## Commands

```bash
# Scheduler
npm run dev               # run one tick (respects timing)
npm run dev:all           # force all agents now

# Individual agents
npm run dev:email         # email agent only
npm run dev:trends        # morning digest only
npm run dev:trending      # Reddit trending only
npm run dev:catchup       # catch-up: all unread today + junk

# Testing
npm run test:slack        # verify Slack webhook
npm run test:claude       # verify Claude CLI

# Log viewer
npm run log               # view today's log
npm run log -- oneline    # compact view
npm run log -- ayer       # yesterday's log
npm run log -- urgente    # filter by classification
npm run log -- quiet      # hide verbose lines

# pm2
npm start                 # start scheduler
npm run status            # check status
npm run logs              # live log stream
npm run restart           # restart scheduler
```

## Configuration

- `config/profile.md` — email classification rules (edit to tune behavior)
- `config/sources.json` — RSS feeds and Reddit sources for trends
- `.env` — credentials, webhook URLs, and trending threshold

## Full documentation

See `CLAUDE.md` for architecture, data flow, and code conventions.
