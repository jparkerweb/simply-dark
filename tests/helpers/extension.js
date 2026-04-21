const { chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function launchWithExtension() {
  const root = path.resolve(__dirname, '..', '..');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-dark-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--disable-extensions-except=' + root,
      '--load-extension=' + root,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let extensionId = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      const match = workers[0].url().match(/^chrome-extension:\/\/([^/]+)\//);
      if (match) {
        extensionId = match[1];
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!extensionId) {
    try {
      const worker = await context.waitForEvent('serviceworker', { timeout: 5000 });
      const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//);
      if (match) extensionId = match[1];
    } catch (_) {}
  }

  if (!extensionId) {
    const page = await context.newPage();
    try {
      await page.goto('chrome://extensions');
      extensionId = await page.evaluate(() => {
        const mgr = document.querySelector('extensions-manager');
        const items = mgr && mgr.shadowRoot
          ? mgr.shadowRoot.querySelectorAll('extensions-item')
          : [];
        for (const item of items) {
          const id = item.getAttribute('id');
          if (id) return id;
        }
        return null;
      });
    } finally {
      await page.close();
    }
  }

  return { context, extensionId, userDataDir };
}

async function seedStorage(context, extensionId, data) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.evaluate((d) => chrome.storage.local.set(d), data);
  } finally {
    await page.close();
  }
}

async function readStorage(context, extensionId) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    return await page.evaluate(() => chrome.storage.local.get(null));
  } finally {
    await page.close();
  }
}

function attachConsoleGuard(page, extensionId) {
  const messages = [];
  const prefix = `chrome-extension://${extensionId}/`;
  page.on('console', (msg) => {
    const loc = msg.location();
    if (loc && loc.url && loc.url.startsWith(prefix)) {
      messages.push(`${msg.type()}: ${msg.text()} @ ${loc.url}`);
    }
  });
  page.on('pageerror', (err) => {
    if (err.stack && err.stack.includes(prefix)) {
      messages.push(`pageerror: ${err.message}`);
    }
  });
  return () => {
    if (messages.length) {
      throw new Error(
        `Extension-origin console messages detected:\n${messages.join('\n')}`
      );
    }
  };
}

module.exports = {
  launchWithExtension,
  seedStorage,
  readStorage,
  attachConsoleGuard,
};
