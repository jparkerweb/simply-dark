const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const {
  launchWithExtension,
  attachConsoleGuard,
} = require('./helpers/extension');

const repoRoot = path.resolve(__dirname, '..');

async function getServiceWorker(context) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) return workers[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  return await context.waitForEvent('serviceworker', { timeout: 2000 });
}

async function pollUntil(fn, timeoutMs = 1000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

function startDelayedFixtureServer(delayMs = 200) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!doctype html><html><head><title>FOUC Fixture</title></head><body><h1>Hello</h1><p>fixture</p></body></html>'
        );
      }, delayMs);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

test('Packaging: node package.js produces zip with approved file list', () => {
  execSync('node package.js', { cwd: repoRoot, stdio: 'pipe' });
  const zipPath = path.join(repoRoot, 'chrome store', 'simply-dark.zip');
  expect(fs.existsSync(zipPath)).toBe(true);

  const zip = new AdmZip(zipPath);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName.replace(/\\/g, '/'));

  const required = [
    'background.js',
    'content.js',
    'dark-mode.css',
    'manifest.json',
    'popup.css',
    'popup.html',
    'popup.js',
    'images/icon16.png',
    'images/icon48.png',
    'images/icon128.png',
  ];
  const allowed = new Set([...required, 'images/options.png']);

  for (const name of required) {
    expect(entries).toContain(name);
  }
  for (const name of entries) {
    expect(allowed.has(name)).toBe(true);
  }
  expect(entries).not.toContain('earlyDarkMode.js');
  expect(entries).not.toContain('domainPreferences.js');
});

test('FOUC + reverse-FOUC + www-coalescing + console hygiene', async () => {
  const { server, port } = await startDelayedFixtureServer(200);
  const fixtureUrl = `http://127.0.0.1:${port}/`;

  const { context, extensionId, userDataDir } = await launchWithExtension();
  const guards = [];

  try {
    const worker = await getServiceWorker(context);

    // Wait for onInstalled migration to settle (it writes an empty domains obj on fresh profiles)
    await pollUntil(async () => {
      const syncEmpty = await worker.evaluate(async () => {
        const s = await chrome.storage.sync.get(null);
        return Object.keys(s).length === 0;
      });
      const hasLocalDomains = await worker.evaluate(async () => {
        const l = await chrome.storage.local.get('domains');
        return 'domains' in l;
      });
      return syncEmpty && hasLocalDomains ? true : null;
    }, 2000);

    // ------------------------------------------------------------
    // FOUC (enabled)
    // ------------------------------------------------------------
    await worker.evaluate(() =>
      chrome.storage.local.set({ domains: { '127.0.0.1': true } })
    );

    const enabledPage = await context.newPage();
    guards.push(attachConsoleGuard(enabledPage, extensionId));

    await enabledPage.addInitScript(() => {
      window.__fouc_samples = [];
      window.__fouc_start = performance.now();
      const sample = () => {
        try {
          const bg = getComputedStyle(document.documentElement).backgroundColor;
          window.__fouc_samples.push({ t: performance.now() - window.__fouc_start, bg });
        } catch (_) {}
      };
      const loop = () => {
        sample();
        if (performance.now() - window.__fouc_start < 3000) {
          requestAnimationFrame(loop);
        }
      };
      requestAnimationFrame(loop);
      const interval = setInterval(() => {
        sample();
        if (performance.now() - window.__fouc_start > 3000) clearInterval(interval);
      }, 20);
    });

    const client = await context.newCDPSession(enabledPage);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 50_000,
      uploadThroughput: 50_000,
    });

    await enabledPage.goto(fixtureUrl, { waitUntil: 'load' });
    await enabledPage.waitForTimeout(500);

    const enabledSamples = await enabledPage.evaluate(() => window.__fouc_samples);
    expect(enabledSamples.length).toBeGreaterThan(0);
    const firstOpaque = enabledSamples.find((s) => {
      const n = s.bg.match(/\d+(\.\d+)?/g) || [];
      const alpha = n.length === 4 ? Number(n[3]) : 1;
      return alpha > 0;
    });
    expect(firstOpaque).toBeTruthy();
    const nums = firstOpaque.bg.match(/\d+(\.\d+)?/g) || [];
    const sum = Number(nums[0] || 0) + Number(nums[1] || 0) + Number(nums[2] || 0);
    expect(sum).toBeLessThan(180);

    await enabledPage.close();

    // ------------------------------------------------------------
    // Reverse-FOUC (disabled)
    // ------------------------------------------------------------
    await worker.evaluate(() =>
      chrome.storage.local.set({ domains: {} })
    );

    const disabledPage = await context.newPage();
    guards.push(attachConsoleGuard(disabledPage, extensionId));

    await disabledPage.addInitScript(() => {
      window.__fouc_samples = [];
      window.__fouc_start = performance.now();
      const sample = () => {
        try {
          const bg = getComputedStyle(document.documentElement).backgroundColor;
          window.__fouc_samples.push({ t: performance.now() - window.__fouc_start, bg });
        } catch (_) {}
        if (performance.now() - window.__fouc_start < 1500) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });

    const client2 = await context.newCDPSession(disabledPage);
    await client2.send('Network.enable');
    await client2.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 50_000,
      uploadThroughput: 50_000,
    });

    await disabledPage.goto(fixtureUrl, { waitUntil: 'load' });

    const disabledSamples = await disabledPage.evaluate(() => window.__fouc_samples);
    const earlyDark = disabledSamples.filter((s) => s.t < 500).filter((s) => {
      const n = s.bg.match(/\d+(\.\d+)?/g) || [];
      const alpha = n.length === 4 ? Number(n[3]) : 1;
      if (alpha === 0) return false;
      const sumS = Number(n[0] || 0) + Number(n[1] || 0) + Number(n[2] || 0);
      return sumS < 180;
    });
    expect(earlyDark).toEqual([]);

    await disabledPage.close();

    // ------------------------------------------------------------
    // www. coalescing end-to-end
    // ------------------------------------------------------------
    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ domains: {} });
    });

    const popup = await context.newPage();
    guards.push(attachConsoleGuard(popup, extensionId));
    await popup.goto(
      `chrome-extension://${extensionId}/popup.html?testDomain=example.com`
    );
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForSelector('#darkModeToggle', { state: 'attached' });

    await expect
      .poll(() => popup.$eval('#currentDomain', (el) => el.textContent))
      .toBe('example.com');

    await popup.$eval('#darkModeToggle', (el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const domainsAfter = await pollUntil(async () => {
      const { domains } = await worker.evaluate(() =>
        chrome.storage.local.get('domains')
      );
      return domains && domains['example.com'] === true ? domains : null;
    });
    expect(domainsAfter).toEqual({ 'example.com': true });

    const wwwTab = await context.newPage();
    guards.push(attachConsoleGuard(wwwTab, extensionId));
    await wwwTab.goto('https://www.example.com/', { waitUntil: 'load' });

    const hasClass = await pollUntil(() =>
      wwwTab.evaluate(() =>
        document.documentElement.classList.contains('simply-dark')
      )
    );
    expect(hasClass).toBe(true);

    const { domains: finalDomains } = await worker.evaluate(() =>
      chrome.storage.local.get('domains')
    );
    expect(Object.keys(finalDomains)).toEqual(['example.com']);
    expect(finalDomains).not.toHaveProperty('www.example.com');

    // Console hygiene — every page had a guard attached
    guards.forEach((assertClean) => assertClean());
  } finally {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
    await new Promise((resolve) => server.close(resolve));
  }
});
