// ecosystem.config.cjs — pm2 process configuration
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: 'wingman',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'main.js',
      // Tick every 5 minutes — scheduler decides which agents to run
      cron_restart: '*/5 * * * *',
      // Not a server — run once per tick, then exit
      autorestart: false,
      watch: false,
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
      },
      // pm2 stdout/stderr disabled — we write our own summary to logs/output.log
      out_file: 'NULL',
      error_file: './logs/error.log',
      max_memory_restart: '200M',
    },
  ],
};
