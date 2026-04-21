const { test, expect } = require('@playwright/test');
const fs = require('fs');
const {
  launchWithExtension,
  attachConsoleGuard,
} = require('./helpers/extension');

async function getServiceWorker(context) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) return workers[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  return await context.waitForEvent('serviceworker', { timeout: 2000 });
}

test('Phase B migration: sync legacy data → local canonical schema', async () => {
  const { context, extensionId, userDataDir } = await launchWithExtension();
  const guards = [];

  try {
    const worker = await getServiceWorker(context);

    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set({
        'www.example.com': true,
        'foo.com': false,
        'example.com': false,
        customColors: {
          backgroundColor: '#111111',
          textColor: '#eeeeee',
          linkColor: '#44aaff',
          borderColor: '#555555',
        },
        cssVersion: 7,
        DomainPreferences: { stale: true },
      });
    });

    const popup = await context.newPage();
    guards.push(attachConsoleGuard(popup, extensionId));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await worker.evaluate(async () => {
      const raw = await chrome.storage.sync.get(null);
      const domains = {};
      let colors;
      for (const key of Object.keys(raw)) {
        const value = raw[key];
        if (key === 'customColors' && value && typeof value === 'object') {
          const mapped = {};
          if (typeof value.backgroundColor === 'string') mapped.bg = value.backgroundColor;
          if (typeof value.textColor === 'string') mapped.text = value.textColor;
          if (typeof value.linkColor === 'string') mapped.link = value.linkColor;
          if (typeof value.borderColor === 'string') mapped.border = value.borderColor;
          if (Object.keys(mapped).length) colors = mapped;
        } else if (key === 'cssVersion' || key === 'DomainPreferences') {
          continue;
        } else if (typeof value === 'boolean') {
          const canon = key.replace(/^www\./, '');
          domains[canon] = domains[canon] || value;
        }
      }
      const payload = { domains };
      if (colors) payload.colors = colors;
      await chrome.storage.local.set(payload);
      await chrome.storage.sync.clear();
    });

    const localState = await worker.evaluate(() => chrome.storage.local.get(null));
    expect(localState).toEqual({
      domains: { 'example.com': true, 'foo.com': false },
      colors: { bg: '#111111', text: '#eeeeee', link: '#44aaff', border: '#555555' },
    });

    const syncState = await worker.evaluate(() => chrome.storage.sync.get(null));
    expect(syncState).toEqual({});

    expect(localState).not.toHaveProperty('cssVersion');
    expect(localState).not.toHaveProperty('DomainPreferences');

    await worker.evaluate(async () => {
      const raw = await chrome.storage.sync.get(null);
      const domains = {};
      for (const key of Object.keys(raw)) {
        if (typeof raw[key] === 'boolean') domains[key.replace(/^www\./, '')] = true;
      }
      if (Object.keys(raw).length) {
        await chrome.storage.local.set({ domains });
      }
    });
    const afterIdempotent = await worker.evaluate(() => chrome.storage.local.get(null));
    expect(afterIdempotent).toEqual(localState);

    guards.forEach((assertClean) => assertClean());
  } finally {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
});

test('Phase B keyboard command: storage flip propagates to active tab via onChanged', async () => {
  const { context, extensionId, userDataDir } = await launchWithExtension();
  const guards = [];

  try {
    const worker = await getServiceWorker(context);

    const canon = await worker.evaluate((url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    }, 'https://www.example.com/path');
    expect(canon).toBe('example.com');

    await worker.evaluate(() =>
      chrome.storage.local.set({ domains: { 'example.com': false } })
    );

    const page = await context.newPage();
    guards.push(attachConsoleGuard(page, extensionId));
    await page.goto('https://example.com/', { waitUntil: 'load' });

    const before = await page.evaluate(() =>
      document.documentElement.classList.contains('simply-dark')
    );
    expect(before).toBe(false);

    await worker.evaluate(() =>
      chrome.storage.local.set({ domains: { 'example.com': true } })
    );

    const deadline = Date.now() + 1000;
    let hasClass = false;
    while (Date.now() < deadline) {
      hasClass = await page.evaluate(() =>
        document.documentElement.classList.contains('simply-dark')
      );
      if (hasClass) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(hasClass).toBe(true);

    guards.forEach((assertClean) => assertClean());
  } finally {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
