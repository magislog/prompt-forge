@echo off
cd /d %~dp0
echo Prompt Forge wo kido shiteimasu...
start "" "http://localhost:3333"
node server.js
pause
