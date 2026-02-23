@echo off
:: Wingman startup — called by Task Scheduler on logon and resume from sleep
:: Waits for system to stabilize, then ensures pm2 + wingman are running

cd /d "C:\Users\Marcelo\code\wingman"
timeout /t 10 /nobreak >nul

:: Clean slate: remove old process if any, then start fresh
call npx pm2 delete wingman >nul 2>&1
call npx pm2 start ecosystem.config.cjs
