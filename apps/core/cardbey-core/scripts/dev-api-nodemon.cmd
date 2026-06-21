@echo off
cd /d "%~dp0.."
node --import tsx "scripts\dev-api-entry.mjs"
