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

# 5. Test Slack connection
npm run test:slack

# 6. Test Claude Code connection
npm run test:claude

# 7. Start the agents
npm run start

# 8. Configure auto-start on boot
pm2 startup
pm2 save
```

## Useful commands

```bash
npm run status        # check agent status
npm run logs          # live log stream
npm run restart       # restart all agents
npm run dev:email     # run the email agent manually (for testing)
npm run dev:trends    # run the trends agent manually (for testing)
npm run test:slack    # verify Slack connection
npm run test:claude   # verify Claude Code connection
```

## Full documentation

See `CLAUDE.md` for full architecture and design decisions.
