// ecosystem.config.cjs — pm2 process configuration
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: 'wingman',
      script: './main.js',
      // Tick every 5 minutes — scheduler decides which agents to run
      cron_restart: '*/5 * * * *',
      // Not a server — run once per tick, then exit
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/output.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '200M',
    },
  ],
};
