# Backend Deployment

This backend is a Node.js (TypeScript) app managed by PM2.

## Prereqs

- Node.js 20+
- npm
- `pm2` installed globally (`npm i -g pm2`)
- MongoDB reachable by the configured `CONNECTION_STRING`

## Environment

Create/edit:

- `./.env`

Minimum variables:

- `CONNECTION_STRING=mongodb://localhost:27017`
- `DB_NAME=portfolio-prod`
- `APP_BASE_URL=https://alexanderwu.nl`
- `APP_PORT=3000`

## Deploy

- Standard:
  - `./scripts/deploy-backend.sh`

- Fresh server (install deps too):
  - `./scripts/deploy-backend.sh --install`

What it does:

1. `npm run build` (TypeScript -> `./dist`)
2. Restarts (or starts) PM2 process `alexanderwu-backend` with `--update-env`

## Useful commands

- Status: `pm2 status alexanderwu-backend`
- Logs: `pm2 logs alexanderwu-backend --lines 200`
- Flush logs: `pm2 flush alexanderwu-backend`

## Optional: autostart on reboot

- `pm2 startup` (follow instructions)
- `pm2 save`
