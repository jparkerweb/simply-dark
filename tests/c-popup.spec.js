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

test('Phase C popup: toggle / save / reset / live-sync against chrome.storage.local', async () => {
  const { context, extensionId, userDataDir } = await launchWithExtension();
  const guards = [];

  try {
    const worker = await getServiceWorker(context);

    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ domains: { 'example.com': false } });
    });

    const siteTab = await context.newPage();
    guards.push(attachConsoleGuard(siteTab, extensionId));
    await siteTab.goto('https://example.com/', { waitUntil: 'load' });

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

    expect(await popup.$eval('#darkModeToggle', (el) => el.checked)).toBe(false);

    await popup.$eval('#darkModeToggle', (el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const afterToggle = await pollUntil(async () => {
      const { domains } = await worker.evaluate(() =>
        chrome.storage.local.get('domains')
      );
      return domains && domains['example.com'] === true ? domains : null;
    });
    expect(afterToggle).toEqual({ 'example.com': true });

    const classApplied = await pollUntil(() =>
      siteTab.evaluate(() =>
        document.documentElement.classList.contains('simply-dark')
      )
    );
    expect(classApplied).toBe(true);

    await popup.$eval('#backgroundColor', (el) => {
      el.value = '#222222';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await popup.$eval('#saveColors', (el) => el.click());

    const savedColors = await pollUntil(async () => {
      const { colors } = await worker.evaluate(() =>
        chrome.storage.local.get('colors')
      );
      return colors && colors.bg === '#222222' ? colors : null;
    });
    expect(savedColors).toEqual({
      bg: '#222222',
      text: '#e4e4e4',
      link: '#3391ff',
      border: '#555555',
    });

    const bgVar = await pollUntil(async () => {
      const v = await siteTab.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--sd-bg')
          .trim()
      );
      return v === '#222222' ? v : null;
    });
    expect(bgVar).toBe('#222222');

    await popup.$eval('#resetColors', (el) => el.click());

    const afterReset = await pollUntil(async () => {
      const all = await worker.evaluate(() => chrome.storage.local.get(null));
      return !('colors' in all) ? all : null;
    });
    expect(afterReset).toBeTruthy();
    expect(afterReset).not.toHaveProperty('colors');

    const resetBgVar = await pollUntil(async () => {
      const v = await siteTab.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--sd-bg')
          .trim()
      );
      return v === '#121212' ? v : null;
    });
    expect(resetBgVar).toBe('#121212');

    expect(await popup.$eval('#backgroundColor', (el) => el.value)).toBe(
      '#121212'
    );

    await worker.evaluate(() =>
      chrome.storage.local.set({ domains: { 'example.com': false } })
    );

    const syncedToggle = await pollUntil(() =>
      popup
        .$eval('#darkModeToggle', (el) => el.checked === false)
        .then((v) => (v ? true : null))
    );
    expect(syncedToggle).toBe(true);

    guards.forEach((assertClean) => assertClean());
  } finally {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
