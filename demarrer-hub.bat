@echo off
rem Lance le hub Editing OS sur Windows et ouvre le navigateur.
cd /d "%~dp0"
start "" http://localhost:4200
npm run os
