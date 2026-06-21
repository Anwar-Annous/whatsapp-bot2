# WhatsApp CRM — Architecture Audit & Redesign Proposal

**Version:** 2.0  
**Date:** 2025-06-18  
**Status:** Proposal & Implementation Plan

---

## 1. Executive Summary

The current WhatsApp CRM is a functional single-tenant proof-of-concept. To evolve it into a scalable SaaS-grade platform capable of managing **multiple independent WhatsApp identities** from a unified dashboard, the architecture must be restructured around three pillars:

1. **Multi-Tenancy (Context Isolation)** — Every WhatsApp identity becomes an isolated "workspace" with its own contacts, conversations, automations, and media.
2. **Service-Oriented Backend** — Controllers become thin HTTP adapters; business logic moves into dedicated, testable services with clear contracts.
3. **Modular Frontend** — The monolithic `app.js` splits into domain-specific modules with a lightweight state manager.

**Migration strategy:** Phase-by-phase, backward-compatible, zero-downtime. The existing database is preserved; new tables are added alongside.

---

## 2. Complete Codebase Audit

### 2.1 Inventory

| Layer | Files | Lines | Notes |
|-------|-------|-------|-------|
| Entry | `backend/index.js` | 83 | Server, Socket.io, route mounting, schema patches |
| Config | `backend/config.js` | 46 | Hardcoded paths, single-tenant defaults |
| Database | `backend/database/db.js` | 18 | Simple mysql2 pool wrapper |
| Schema | `backend/database/schema.sql` | 97 | Initial DDL, no migration framework |
| Middleware | `backend/middleware/auth.js` | 6 | Single `ensureLoggedIn` check |
| Routes | `backend/routes/*.js` | 3 files | Flat REST, no versioning |
| Controllers | `backend/controllers/*.js` | 3 files | `apiController` is a 195-line god object |
| Services | `backend/services/*.js` | 3 files | `whatsappService` holds global mutable state |
| Frontend | `frontend/js/app.js` | 813 | Monolithic, no modules |
| Frontend | `frontend/pages/*.html` | 3 files | Static HTML, no templating engine |
| CSS | `frontend/css/style.css` | 932 | Well-designed theme |

### 2.2 Critical Weaknesses (Severity Ranked)

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | **Single global WhatsApp client** — `whatsappService.js` uses module-level `let client` and `let status` | 🔴 Critical | Blocks multi-tenancy entirely; one crash kills all sessions |
| 2 | **No multi-tenancy concept** — No `workspace`, `tenant`, or `account` entity in DB or code | 🔴 Critical | Cannot run multiple WhatsApp numbers from one instance |
| 3 | **God controller** — `apiController.js` handles inbox, contacts, automation, metrics, campaigns, media, logs, search | 🔴 Critical | Unmaintainable; every feature change touches the same file |
| 4 | **Hardcoded single-user auth** — `admin@example.com` / `admin123` in `config.js` | 🔴 Critical | No user management, no RBAC, no team support |
| 5 | **No migration framework** — Schema changes are inline `ALTER TABLE` in `index.js` | 🟠 High | Risk of corruption, no rollback, no versioning |
| 6 | **Global Socket.io broadcast** — All events go to all sockets regardless of workspace | 🟠 High | Data leaks between contexts; no room isolation |
| 7 | **No queue / async processing** — Campaigns send synchronously in a loop | 🟠 High | Blocks event loop; no retry; no rate limiting |
| 8 | **No input validation layer** — No Joi/Zod/schemas; raw params passed to SQL | 🟠 High | Injection risk; malformed data crashes handlers |
| 9 | **No structured logging** — `logService` writes to DB; no correlation IDs, no log levels | 🟠 High | Impossible to debug production issues |
| 10 | **Monolithic frontend** — `app.js` at 813 lines handles all UI logic | 🟡 Medium | No code splitting; hard to test |
| 11 | **No graceful shutdown** — `SIGINT` exits immediately; connections not closed | 🟡 Medium | Data loss risk on restart |
| 12 | **Media stored locally only** — No abstraction for S3/CDN | 🟡 Medium | Disk fills up; no backup; no scaling |
| 13 | **No API documentation** — No OpenAPI/Swagger | 🟡 Medium | Integration difficulty |
| 14 | **No health/metrics endpoint** — No `/health`, no Prometheus | 🟡 Medium | No monitoring for SaaS ops |
| 15 | **No webhook / external integration hooks** | 🟡 Medium | Blocks AI and third-party integrations |
| 16 | **Puppeteer config is fragile** — Hardcoded paths, no retry strategy | 🟡 Medium | WhatsApp connection unreliable |
| 17 | **No message retry logic** — Failed sends are lost | 🟡 Medium | Message loss in unreliable networks |
| 18 | **No contact import/export** — No CSV/Excel support | 🟢 Low | UX limitation |
| 19 | **No conversation archiving** — Data grows unbounded | 🟢 Low | Performance degradation over time |
| 20 | **No rate limiting** — Campaigns can spam unlimited contacts | 🟢 Low | Abuse risk |

---

## 3. Proposed Architecture (v2.0)

### 3.1 Core Design Principles

1. **Workspace Isolation** — Every WhatsApp number is a `workspace`. All data (contacts, conversations, media, automations) is scoped to a workspace.
2. **Thin Controllers, Fat Services** — HTTP handlers only validate, parse, and delegate. Business logic lives in testable services.
3. **Event-Driven Async Processing** — Campaigns, bulk sends, and automations use an in-memory job queue (Bull/Queue-lite) with retry.
4. **Structured Logging** — Winston or Pino with correlation IDs, log levels, and separate streams for ops vs. debug.
5. **Modular Frontend** — Domain-specific JS modules (`inbox.js`, `contacts.js`, `automation.js`, etc.) with a lightweight pub/sub state bus.
6. **Migration Framework** — Versioned SQL migrations using `db-migrate` or a custom runner.
7. **Graceful Lifecycle** — Proper startup/shutdown sequences with connection cleanup.

### 3.2 New Directory Structure

```
whatsapp-crm-v2/
├── backend/
│   ├── app.js                    # Express app factory (no server listen)
│   ├── server.js                 # HTTP server + Socket.io startup
│   ├── config/
│   │   ├── index.js              # Environment-aware config loader
│   │   ├── database.js           # DB connection settings
│   │   ├── whatsapp.js           # Puppeteer defaults + Chrome detection
│   │   └── security.js           # JWT secrets, session, rate limits
│   ├── database/
│   │   ├── migrations/           # Versioned .sql files
│   │   │   ├── 001_initial.sql   # Current schema (baseline)
│   │   │   ├── 002_workspaces.sql
│   │   │   ├── 003_users.sql
│   │   │   ├── 004_api_keys.sql
│   │   │   └── 005_message_retries.sql
│   │   ├── migrate.js            # Migration runner
│   │   └── db.js                 # Connection pool (unchanged interface)
│   ├── middleware/
│   │   ├── auth.js               # JWT validation + workspace extraction
│   │   ├── errorHandler.js       # Centralized error handler
│   │   ├── validate.js           # Request validation (Zod schemas)
│   │   ├── rateLimit.js          # Per-workspace rate limiting
│   │   └── requireWorkspace.js   # Ensures workspace context exists
│   ├── models/                   # Data access layer (repositories)
│   │   ├── workspace.js
│   │   ├── user.js
│   │   ├── contact.js
│   │   ├── conversation.js
│   │   ├── message.js
│   │   ├── media.js
│   │   ├── automation.js
│   │   └── log.js
│   ├── services/                 # Business logic (orchestrators)
│   │   ├── workspaceManager.js     # CRUD + lifecycle for workspaces
│   │   ├── whatsappEngine/       # Per-workspace client manager
│   │   │   ├── index.js            # Factory + registry
│   │   │   ├── client.js           # Single WhatsApp client wrapper
│   │   │   └── sessionStore.js     # LocalAuth path management
│   │   ├── inboxService.js         # Conversation + message logic
│   │   ├── contactService.js       # Contact CRUD + dedup
│   │   ├── campaignService.js      # Queue-based bulk send
│   │   ├── automationEngine.js     # Rule engine + scheduling
│   │   ├── mediaService.js         # Upload + storage abstraction
│   │   └── analyticsService.js     # Metrics + reporting
│   ├── jobs/                     # Background job processors
│   │   ├── campaignQueue.js
│   │   ├── scheduledMessageQueue.js
│   │   └── retryQueue.js
│   ├── routes/
│   │   ├── v1/                   # API versioning
│   │   │   ├── auth.js
│   │   │   ├── workspaces.js
│   │   │   ├── inbox.js
│   │   │   ├── contacts.js
│   │   │   ├── campaigns.js
│   │   │   ├── automations.js
│   │   │   ├── media.js
│   │   │   ├── analytics.js
│   │   │   ├── logs.js
│   │   │   └── health.js
│   │   └── index.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── workspaceController.js
│   │   ├── inboxController.js
│   │   ├── contactController.js
│   │   ├── campaignController.js
│   │   ├── automationController.js
│   │   ├── mediaController.js
│   │   ├── analyticsController.js
│   │   └── logController.js
│   ├── utils/
│   │   ├── logger.js             # Pino/Winston wrapper
│   │   ├── errors.js             # Custom error classes
│   │   ├── validators.js         # Zod schemas
│   │   └── phoneNormalizer.js    # Phone number formatting
│   └── webhooks/                 # Extension hooks for AI / integrations
│       ├── webhookDispatcher.js
│       └── aiBridge.js
├── frontend/
│   ├── js/
│   │   ├── core/
│   │   │   ├── state.js            # Lightweight pub/sub state bus
│   │   │   ├── api.js              # HTTP client with JWT + workspace header
│   │   │   ├── socket.js           # Socket.io connection manager
│   │   │   └── toast.js            # Toast notification system
│   │   ├── modules/
│   │   │   ├── inbox.js
│   │   │   ├── contacts.js
│   │   │   ├── automation.js
│   │   │   ├── media.js
│   │   │   ├── logs.js
│   │   │   ├── qr.js
│   │   │   └── workspaceSwitcher.js
│   │   └── app.js                  # Entry point: init + routing
│   ├── pages/
│   │   └── dashboard.html          # Single dashboard (sections remain)
│   └── css/
│       └── style.css
├── uploads/                        # Local storage (unchanged for now)
├── .env.example
├── package.json
├── ecosystem.config.js             # PM2 config
└── README.md
```

### 3.3 Database Schema Evolution

**New Tables:**

```sql
-- Workspaces (tenants)
CREATE TABLE workspaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),          -- The WhatsApp number for this workspace
  status ENUM('active','paused','disconnected') DEFAULT 'disconnected',
  settings_json TEXT,                -- Per-workspace settings
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Users (multi-user support)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) DEFAULT '',
  role ENUM('admin','manager','agent') DEFAULT 'agent',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workspace membership (many-to-many)
CREATE TABLE workspace_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  workspace_id INT NOT NULL,
  role ENUM('owner','admin','agent') DEFAULT 'agent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, workspace_id)
);

-- Workspace-scoped data (add workspace_id to existing tables)
-- contacts, conversations, messages, automations, media, logs, scheduled_messages
-- all get: workspace_id INT NOT NULL

-- API keys for external integrations (webhooks, AI)
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  permissions JSON,
  last_used_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Message retry log
CREATE TABLE message_retries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  attempt_number INT DEFAULT 1,
  error TEXT,
  status ENUM('pending','retrying','failed','success') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook subscriptions
CREATE TABLE webhooks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  url VARCHAR(512) NOT NULL,
  events JSON,                       -- ['message.incoming', 'contact.created']
  secret VARCHAR(255),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### 3.4 Multi-Workspace WhatsApp Engine

Instead of a single global `client`, we maintain a **Client Registry**:

```javascript
// backend/services/whatsappEngine/index.js
class WhatsAppEngine {
  constructor() {
    this.clients = new Map(); // workspaceId -> ClientWrapper
  }

  async createWorkspace(workspaceId, phoneNumber) {
    const wrapper = new ClientWrapper(workspaceId, phoneNumber);
    this.clients.set(workspaceId, wrapper);
    await wrapper.initialize();
    return wrapper;
  }

  async destroyWorkspace(workspaceId) {
    const wrapper = this.clients.get(workspaceId);
    if (wrapper) {
      await wrapper.destroy();
      this.clients.delete(workspaceId);
    }
  }

  getStatus(workspaceId) {
    return this.clients.get(workspaceId)?.getStatus() || { state: 'disconnected' };
  }

  getAllStatuses() {
    const result = {};
    for (const [id, wrapper] of this.clients) {
      result[id] = wrapper.getStatus();
    }
    return result;
  }
}
```

Each `ClientWrapper` encapsulates:
- Puppeteer instance with isolated session directory (`session/workspace-{id}/`)
- Event handlers scoped to the workspace
- Message queue per workspace
- Health monitoring (heartbeat, auto-reconnect)

### 3.5 Request Flow (JWT + Workspace Header)

```
Browser → POST /api/v1/auth/login
          ← JWT token + workspace list

Browser → GET /api/v1/inbox/conversations
          Header: Authorization: Bearer <jwt>
          Header: X-Workspace-Id: 3
          → auth middleware validates JWT
          → requireWorkspace middleware checks membership
          → inboxController queries with workspace_id = 3
          ← JSON response
```

### 3.6 Socket.io Room Architecture

```javascript
// On connection, client sends workspace_id after auth
socket.on('join_workspace', (workspaceId) => {
  socket.join(`workspace:${workspaceId}`);
});

// WhatsApp events are emitted only to the workspace room
io.to(`workspace:${workspaceId}`).emit('new_message', data);
```

### 3.7 Campaign Queue (Bull-inspired, simple in-memory)

For a student-level project without Redis, we use an **in-memory job queue** with persistence:

```javascript
// backend/jobs/campaignQueue.js
class CampaignQueue {
  constructor() {
    this.jobs = []; // persisted to DB table `campaign_jobs`
    this.running = false;
  }

  async add(campaignId, contactIds, text, workspaceId) {
    const job = await db.query('INSERT INTO campaign_jobs ...', [...]);
    this.jobs.push(job);
    if (!this.running) this.process();
  }

  async process() {
    this.running = true;
    while (this.jobs.length) {
      const job = this.jobs.shift();
      await this.sendBatch(job);
      await sleep(1000); // Rate limit: 1 msg/sec
    }
    this.running = false;
  }
}
```

---

## 4. Implementation Plan (Phased)

### Phase 1: Foundation — Infrastructure & Multi-Tenancy Core
**Goal:** Establish the new directory structure, migration system, and workspace model.

1. Create `backend/config/` with environment-aware loader
2. Create `backend/database/migrations/` and `migrate.js` runner
3. Write migrations `001` through `005`
4. Run migrations to add `workspace_id` columns to all existing tables
5. Create `backend/models/workspace.js` and `backend/models/user.js`
6. Seed a default workspace (id=1) and migrate all existing data into it
7. Create `backend/services/whatsappEngine/` with `ClientWrapper` and `Engine`
8. Keep old `whatsappService.js` running as fallback during transition

### Phase 2: Backend Services Refactor
**Goal:** Replace god controller with clean, workspace-scoped services.

1. Create `backend/services/inboxService.js`, `contactService.js`, `campaignService.js`, `automationEngine.js`, `mediaService.js`, `analyticsService.js`
2. Create `backend/models/` for each domain (contact, conversation, message, media, automation, log)
3. Create `backend/controllers/` — one per domain, thin, workspace-aware
4. Create `backend/routes/v1/` — versioned API, workspace-scoped
5. Create `backend/middleware/` — JWT auth, validation, rate limit, workspace check
6. Wire everything in `backend/app.js` (Express factory)
7. Update `backend/server.js` to start with graceful shutdown

### Phase 3: Frontend Modularization
**Goal:** Split monolithic `app.js` into maintainable modules.

1. Create `frontend/js/core/state.js` — pub/sub bus
2. Create `frontend/js/core/api.js` — HTTP client with JWT + workspace header
3. Create `frontend/js/core/socket.js` — Socket.io manager with room join
4. Create `frontend/js/modules/` — `inbox.js`, `contacts.js`, `automation.js`, `media.js`, `logs.js`, `qr.js`, `workspaceSwitcher.js`
5. Rewrite `frontend/js/app.js` as orchestrator only
6. Add workspace selector to sidebar header
7. Update `dashboard.html` to include new script tags

### Phase 4: WhatsApp Engine Migration
**Goal:** Replace global WhatsApp client with per-workspace engine.

1. Create isolated session directories per workspace
2. Migrate existing session to `workspace-1`
3. Start `WhatsAppEngine` with workspace 1
4. Update Socket.io to emit per-workspace rooms
5. Add workspace QR page (`/qr/:workspaceId`)
6. Add workspace status indicators in sidebar

### Phase 5: Production Hardening
**Goal:** Make it deployable and monitorable.

1. Add `ecosystem.config.js` for PM2 with cluster mode
2. Add `/api/v1/health` endpoint (DB + WhatsApp status)
3. Add structured logging with `backend/utils/logger.js`
4. Add graceful shutdown (close DB pool, destroy all WhatsApp clients)
5. Add `.env.example` with all new variables
6. Update `README.md` with deployment guide

### Phase 6: Future-Ready Hooks
**Goal:** Prepare for AI and SaaS growth.

1. Add `backend/webhooks/webhookDispatcher.js` — fires on key events
2. Add `backend/webhooks/aiBridge.js` — middleware hook for AI processing
3. Add `api_keys` table and middleware for external API access
4. Add billing hooks (placeholder table `workspace_plans`)
5. Add contact import/export (CSV)

---

## 5. Migration Strategy from Current System

### Step 1: Zero-Downtime Baseline
- The current app runs on workspace_id=1 implicitly.
- Add `workspace_id` columns with `DEFAULT 1` and `NOT NULL`.
- All existing data automatically belongs to workspace 1.
- Old routes (`/api/*`) remain functional; new routes (`/api/v1/*`) are added alongside.

### Step 2: Dual-Route Period
- Frontend continues using old routes during transition.
- Backend serves both old and new routes.
- New workspace features only available via new routes.

### Step 3: Frontend Switchover
- Once new frontend modules are stable, switch dashboard to use `/api/v1/*`.
- Old routes are deprecated but kept for external integrations.

### Step 4: Cleanup
- After 30 days of stability, remove old routes and controllers.
- Rename `apiController.js` to `apiController.legacy.js` as archive.

---

## 6. Risk Assessment & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Puppeteer memory leak with multiple clients | Medium | Limit concurrent workspaces; add `max_workspaces` config; periodic restart |
| DB migration failure | Low | Backup before migration; transactional migrations; dry-run mode |
| Socket.io room leaks | Low | Explicit `socket.leave()` on disconnect; room cleanup job |
| JWT secret exposure | Low | Rotate secrets via env; short expiry; refresh tokens |
| WhatsApp ban risk | Medium | Rate limiting (1 msg/sec per workspace); campaign batch size limits |
| Student-level complexity drift | High | Keep code plain JS, no frameworks (Nest, TypeScript); clear comments; simple patterns |

---

## 7. Success Criteria

1. **Multiple WhatsApp numbers** can be connected from one dashboard.
2. **Workspace switcher** in the UI changes all data (contacts, conversations, automations) instantly.
3. **Zero data loss** during migration.
4. **Old routes remain functional** until Phase 4.
5. **Code is readable** — each file has a single responsibility; no file > 200 lines of business logic.
6. **Database has migrations** — any schema change is a numbered `.sql` file.
7. **Logs are structured** — every request and WhatsApp event has a traceable log entry.

---

## 8. Decision Log

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Framework? | No (keep Express) | Student-level; Nest.js adds complexity; owner wants "motivated student" code |
| TypeScript? | No | Same reasoning; plain JS is easier to explain during oral defense |
| ORM? | No | Raw SQL with mysql2/promise is fine; no abstraction overhead |
| Redis? | No | In-memory queue + DB persistence is sufficient for MVP |
| S3/CDN? | No (placeholder) | Local storage is fine for student project; abstraction layer prepares for future S3 |
| JWT vs Session | JWT + session hybrid | JWT for API auth; session for dashboard convenience during transition |
| API Versioning | `/api/v1/` | Industry standard; allows gradual deprecation of old routes |
| Migration Tool | Custom runner | No new dependencies; simple `.sql` files numbered sequentially |

---

## 9. Immediate Next Steps

1. **Create `backend/database/migrations/`** and `migrate.js`.
2. **Write migration `001` through `005`** and execute against existing `whatsappcrm` DB.
3. **Create `backend/models/workspace.js`** and seed workspace 1.
4. **Begin Phase 1** implementation.

**End of Architecture Document**
