const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: process.env.PORT || 4000,
  sessionSecret: process.env.SESSION_SECRET || 'crm-secret-key',
  authUser: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'whatsappcrm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  whatsapp: {
    sessionDir: path.join(__dirname, '..', 'backend', 'session'),
    puppeteer: buildPuppeteerConfig()
  }
};

function buildPuppeteerConfig() {
  const config = {
    headless: process.env.WA_HEADLESS !== undefined ? parseBoolean(process.env.WA_HEADLESS) : true,
    dumpio: true,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-breakpad',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=site-per-process',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  };

  const chromePath = resolveChromePath();
  if (chromePath) {
    config.executablePath = chromePath;
  } else {
    try {
      // prefer Puppeteer's bundled Chromium when no CHROME_PATH is set
      const puppeteer = require('puppeteer');
      const execPath = puppeteer.executablePath();
      if (execPath) config.executablePath = execPath;
    } catch (e) {
      // ignore if puppeteer isn't installed or executablePath isn't available
    }
  }

  return config;
}

function parseBoolean(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(text);
}

function resolveChromePath() {
  const envPath = process.env.CHROME_PATH;
  if (!envPath) {
    return detectChromePath();
  }

  const trimmed = String(envPath).trim();
  if (trimmed.toLowerCase() === 'auto') {
    return undefined;
  }

  return trimmed;
}

function detectChromePath() {
  const defaultPaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome Beta/Application/chrome.exe',
    'C:/Program Files/Google/Chrome SxS/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome Beta/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome SxS/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];

  for (const chromePath of defaultPaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return undefined;
}
