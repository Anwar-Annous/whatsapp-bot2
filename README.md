# WhatsApp CRM v2.0 — Multi-Workspace Platform

> From a single WhatsApp number to a multi-tenant CRM platform.

## What's New in v2.0

- **Multi-Workspace Support** — Manage multiple WhatsApp numbers from one dashboard
- **Migration Framework** — Versioned database migrations with rollback
- **Modular Frontend** — Domain-specific JS modules with workspace-aware state
- **Structured Logging** — JSON logs with correlation IDs and levels
- **Per-Workspace WhatsApp Engine** — Each workspace has an isolated client
- **Graceful Shutdown** — Clean connection cleanup on restart
- **Workspace-Scoped API** — All data filtered by workspace context
- **Health Endpoint** — `/health` for monitoring

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your database credentials

# 3. Run migrations
npm run migrate

# 4. Start the server
npm start

# 5. Open dashboard
# http://localhost:4000/dashboard
```

## Architecture

```
backend/
  app.js              # Express app factory
  server.js           # HTTP server + Socket.io + WhatsAppEngine
  config/             # Environment-aware configuration
  database/
    migrations/         # Versioned .sql files
    migrate.js          # Migration runner
  models/             # Data access layer (workspace, contact, etc.)
  services/
    whatsappEngine/     # Per-workspace client management
    automationService.js
    logService.js
  controllers/          # Thin HTTP handlers
  routes/v1/            # Versioned API
  middleware/           # Auth, workspace, validation
  utils/                # Logger, errors, validators
  webhooks/             # AI / integration hooks

frontend/
  js/
    core/               # state, api, socket
    modules/            # inbox, contacts, automation, media, logs, qr
    app.js              # Orchestrator
```

## Database Migrations

Migrations are numbered `.sql` files in `backend/database/migrations/`.

```bash
# Run pending migrations
npm run migrate

# Check status (dry-run)
node backend/database/migrate.js --dry-run
```

### Migration History

| File | Description |
|------|-------------|
| `001_initial.sql` | Baseline schema (from original project) |
| `002_add_workspace_support.sql` | Workspaces table + workspace_id on all tables |
| `003_add_users_and_members.sql` | Multi-user + workspace membership |
| `004_add_extensions.sql` | API keys, webhooks, message retries, campaign jobs |

## Multi-Workspace Usage

1. **Create a workspace** via `POST /api/v1/workspaces`
2. **Connect WhatsApp** via `POST /api/v1/workspaces/:id/connect`
3. **Scan QR** at `/qr` for the new workspace
4. **Switch workspaces** using the dropdown in the sidebar

All data (contacts, conversations, automations, media) is automatically scoped to the selected workspace.

## API Endpoints

### Legacy (backward compatible)
- `POST /api/auth/login`
- `GET /api/conversations`
- `GET /api/contacts`
- `GET /api/automation`
- `POST /api/automation`
- `GET /api/media`
- `POST /api/media/upload`
- `GET /api/qr`
- `GET /api/logs`
- `GET /api/metrics`
- `POST /api/campaign`

### New v1 (workspace-aware)
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:id`
- `GET /api/v1/workspaces/:id/status`
- `POST /api/v1/workspaces/:id/connect`
- `POST /api/v1/workspaces/:id/disconnect`
- `DELETE /api/v1/workspaces/:id`

### Health
- `GET /health` — Returns `{ status: 'ok', timestamp }`

## PM2 Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit

# Logs
pm2 logs whatsapp-crm
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | HTTP server port |
| `DB_HOST` | 127.0.0.1 | MySQL host |
| `DB_USER` | root | MySQL user |
| `DB_PASSWORD` | | MySQL password |
| `DB_NAME` | whatsappcrm | Database name |
| `SESSION_SECRET` | | Cookie/session secret |
| `LOG_LEVEL` | info | debug, info, warn, error |
| `NODE_ENV` | development | development, production |

## Troubleshooting

**WhatsApp client fails to initialize:**
```bash
# Clear session for a workspace and reconnect
rm -rf session/workspace-1
# Then restart and scan QR again
```

**Port already in use:**
```bash
# Find and kill process on port 4000
npx kill-port 4000
```

**Database migration failed:**
```bash
# Check migration status
node backend/database/migrate.js --dry-run

# Manual rollback (last migration only)
node backend/database/migrate.js rollback
```

## License

MIT — Student project.
