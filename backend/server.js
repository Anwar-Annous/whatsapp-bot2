const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const { WhatsAppEngine } = require('./services/whatsappEngine');
const { logger } = require('./utils/logger');
const { migrate } = require('./database/migrate');
const db = require('./database/db');

const server = http.createServer(app);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port already in use', { port: config.port, error: err.message });
    console.error(`Port ${config.port} is already in use. Stop the existing process or change PORT in .env.`);
    process.exit(1);
  }
  logger.error('Server error', { error: err.message });
});

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// WhatsApp engine manages multiple workspace clients
const engine = new WhatsAppEngine(io);
app.locals.engine = engine;

// Socket.io room management
io.on('connection', (socket) => {
  logger.info('Socket connected', { socketId: socket.id });

  socket.on('join_workspace', (workspaceId) => {
    socket.join(`workspace:${workspaceId}`);
    logger.info('Socket joined workspace', { socketId: socket.id, workspaceId });
    const status = engine.getStatus(workspaceId);
    socket.emit('session_update', status);
  });

  socket.on('leave_workspace', (workspaceId) => {
    socket.leave(`workspace:${workspaceId}`);
  });

  socket.on('disconnect', () => {
    logger.info('Socket disconnected', { socketId: socket.id });
  });
});

async function ensureRuntimeSchema() {
  // Scheduled messages table (if not exists)
  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      chat_id VARCHAR(128) NOT NULL,
      type ENUM('text','image','audio','video') NOT NULL,
      text TEXT,
      media_id INT,
      scheduled_at DATETIME NOT NULL,
      status ENUM('pending','sent','failed') DEFAULT 'pending',
      workspace_id INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

const automationService = require('./services/automationService');
const logService = require('./services/logService');

const SCHEDULED_WORKER_INTERVAL_MS = 1000;
let scheduledWorker = null;

function startScheduledMessageWorker() {
  if (scheduledWorker) return;
  scheduledWorker = setInterval(async () => {
    try {
      const rows = await db.query("SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC, id ASC");
      for (const row of rows) {
        const wrapper = engine.getClient(row.workspace_id);
        if (!wrapper) {
          await db.query('UPDATE scheduled_messages SET status = ?, updated_at = NOW() WHERE id = ?', ['failed', row.id]);
          continue;
        }
        try {
          if (row.type === 'text' && row.text) {
            await wrapper.sendText(row.chat_id, row.text);
          }
          if ((['image', 'audio', 'video'].includes(row.type)) && row.media_id) {
            await wrapper.sendMediaById(row.chat_id, row.media_id, row.type, (row.type === 'image' || row.type === 'video') ? row.text : null);
          }
          await db.query('UPDATE scheduled_messages SET status = ?, updated_at = NOW() WHERE id = ?', ['sent', row.id]);
          await logService.create('info', 'scheduled_sent', `scheduled ${row.type} sent to ${row.chat_id}`, row.workspace_id);
        } catch (error) {
          await db.query('UPDATE scheduled_messages SET status = ?, updated_at = NOW() WHERE id = ?', ['failed', row.id]);
          await logService.create('error', 'scheduled_send_failed', `failed ${row.type} to ${row.chat_id}: ${error.message}`, row.workspace_id);
        }
      }
    } catch (err) {
      logger.error('Scheduled worker error', { error: err.message });
    }
  }, SCHEDULED_WORKER_INTERVAL_MS);
}

async function start() {
  try {
    await migrate();
    await ensureRuntimeSchema();
    await engine.loadAllWorkspaces();
    startScheduledMessageWorker();
    logger.info('WhatsApp engine loaded all workspaces');
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }

  server.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    if (scheduledWorker) {
      clearInterval(scheduledWorker);
      scheduledWorker = null;
    }
    await engine.destroyAll();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } catch (err) {
    logger.error('Shutdown error', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, p) => {
  logger.error('unhandledRejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { error: err.message });
});

start();
