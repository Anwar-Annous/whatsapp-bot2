const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { logger, requestLogger } = require('./utils/logger');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Extract workspace context from all API requests
app.use((req, res, next) => {
  const wsId = req.headers['x-workspace-id'] || req.body?.workspace_id || 1;
  req.workspaceId = Number(wsId) || 1;
  next();
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Legacy routes (backward compatible, default workspace_id = 1)
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const mediaRoutes = require('./routes/media');
const { ensureLoggedIn } = require('./middleware/auth');

app.use('/api/auth', authRoutes);
app.use('/api', ensureLoggedIn, apiRoutes);
app.use('/api/media', ensureLoggedIn, mediaRoutes);

// New v1 API (workspace-aware)
const v1WorkspaceRoutes = require('./routes/v1/workspaces');
app.use('/api/v1/workspaces', v1WorkspaceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'login.html')));
app.get('/dashboard', ensureLoggedIn, (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'dashboard.html')));
app.get('/qr', ensureLoggedIn, (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'qr.html')));

module.exports = app;
