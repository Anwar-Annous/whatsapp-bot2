const path = require('path');
const config = require('../config');
const puppeteer = require('puppeteer');

async function main() {
  const baseOpts = Object.assign({}, config.whatsapp.puppeteer || {});
  let opts = baseOpts;
  if (opts.executablePath && typeof opts.executablePath.then === 'function') {
    try {
      opts = Object.assign({}, opts, { executablePath: await opts.executablePath });
    } catch (e) {
      console.warn('Failed to resolve executablePath promise:', e.message);
    }
  }

  opts.headless = false;
  opts.timeout = 0;
  console.log('Launching browser with options:', {
    executablePath: opts.executablePath,
    args: opts.args && opts.args.slice(0, 10)
  });

  const browser = await puppeteer.launch(opts);
  browser.on('disconnected', () => {
    console.log('Browser disconnected');
    process.exit(0);
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('error', (err) => console.error('PAGE ERROR:', err));
  page.on('pageerror', (err) => console.error('PAGE PAGEERROR:', err));

  try {
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Page loaded, waiting 20s to observe...');
    await new Promise((r) => setTimeout(r, 20000));
  } catch (err) {
    console.error('Navigation error:', err.message);
  } finally {
    try { await browser.close(); } catch (e) {}
    process.exit(0);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
