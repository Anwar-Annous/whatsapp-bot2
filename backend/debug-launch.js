const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');

const debugSession = path.join(__dirname, 'session-debug');
if (!fs.existsSync(debugSession)) fs.mkdirSync(debugSession, { recursive: true });

const puppeteerOpts = Object.assign({}, config.whatsapp.puppeteer || {});
// ensure a writable disk cache dir for Chromium
const os = require('os');
const cacheDir = path.join(os.tmpdir(), 'whatsapp-bot1-cache-debug');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
puppeteerOpts.args = (puppeteerOpts.args || []).concat([
  `--disk-cache-dir=${cacheDir}`,
  '--disable-extensions',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-features=VizDisplayCompositor',
  '--disable-dev-shm-usage',
  '--no-sandbox'
]);

let client;

(async () => {
  try {
    // resolve executablePath if it's a Promise (puppeteer.executablePath may be async)
    if (puppeteerOpts.executablePath && typeof puppeteerOpts.executablePath.then === 'function') {
      try {
        puppeteerOpts.executablePath = await puppeteerOpts.executablePath;
      } catch (e) {
        // leave as-is if it fails
      }
    }

    console.log('Starting debug client with puppeteer options:', JSON.stringify(puppeteerOpts, null, 2));

    client = new Client({
      authStrategy: new LocalAuth({ clientId: 'debug-client', dataPath: debugSession }),
      puppeteer: puppeteerOpts
    });

    client.on('qr', (qr) => {
      console.log('QR event received');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => console.log('Authenticated'));
    client.on('auth_failure', (err) => console.error('Auth failure', err));
    client.on('ready', () => console.log('Ready'));
    client.on('disconnected', (reason) => console.log('Disconnected', reason));
    client.on('message', (msg) => console.log('Message', msg.body && msg.body.slice(0, 80)));

    await client.initialize();
  } catch (err) {
    console.error('Client initialize failed:', err);
    try { if (client) await client.destroy(); } catch (e) {}
    process.exit(1);
  }
})();
