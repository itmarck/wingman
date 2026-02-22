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

# 7. Run the email agent manually to verify
npm run dev:email

# 8. Start the agents as cron jobs
npm start

# 9. Configure auto-start on boot
pm2 startup
pm2 save
```

## Commands

```bash
npm run dev:email         # run email agent once (testing)
npm run dev:trends        # run trends agent once (testing)
npm run test:slack        # verify Slack webhook
npm run test:claude       # verify Claude CLI

npm run log               # view today's log
npm run log -- oneline    # compact view
npm run log -- ayer       # yesterday's log
npm run log -- urgente    # filter by classification
npm run log -- quiet      # hide verbose lines

npm start                 # start pm2 cron jobs
npm run status            # check agent status
npm run logs              # live pm2 log stream
npm run restart           # restart all agents
```

## Configuration

- `config/profile.md` — email classification rules (edit to tune behavior)
- `config/sources.json` — RSS feeds and Reddit sources for trends
- `.env` — credentials and webhook URLs

## Full documentation

See `CLAUDE.md` for architecture, data flow, and code conventions.
