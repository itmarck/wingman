// ecosystem.config.js — pm2 process configuration
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

export default {
  apps: [
    {
      name: 'email-agent',
      script: './agents/email/index.js',
      // Cron: runs every 20 minutes
      cron_restart: '*/20 * * * *',
      // Not a server — run once per cycle, then exit
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // Separate log files per agent
      out_file: './logs/email-agent-out.log',
      error_file: './logs/email-agent-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Auto-restart if memory exceeds 200MB (leak protection)
      max_memory_restart: '200M',
    },
    {
      name: 'trends-agent',
      script: './agents/trends/index.js',
      // Cron: runs every day at 7:30am
      cron_restart: '30 7 * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/trends-agent-out.log',
      error_file: './logs/trends-agent-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '200M',
    },
  ],
};
