const { test, expect } = require('@playwright/test');
const fs = require('fs');
const {
  launchWithExtension,
  seedStorage,
  attachConsoleGuard,
} = require('./helpers/extension');

function parseRgbSum(rgbString) {
  const nums = rgbString.match(/\d+(\.\d+)?/g);
  if (!nums) return 0;
  return Number(nums[0]) + Number(nums[1]) + Number(nums[2]);
}

test('Phase A foundation: dark on enabled domain, light on disabled, no extension console output', async () => {
  const { context, extensionId, userDataDir } = await launchWithExtension();
  const guards = [];

  try {
    await seedStorage(context, extensionId, { domains: { 'example.com': true } });

    const enabledPage = await context.newPage();
    guards.push(attachConsoleGuard(enabledPage, extensionId));
    await enabledPage.goto('https://example.com/', { waitUntil: 'load' });

    const enabledClass = await enabledPage.evaluate(() =>
      document.documentElement.classList.contains('simply-dark')
    );
    expect(enabledClass).toBe(true);

    const enabledBg = await enabledPage.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor
    );
    expect(parseRgbSum(enabledBg)).toBeLessThan(180);

    const sdBg = await enabledPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--sd-bg').trim()
    );
    expect(sdBg).toBe('#121212');

    const disabledPage = await context.newPage();
    guards.push(attachConsoleGuard(disabledPage, extensionId));
    await disabledPage.goto('https://en.wikipedia.org/', { waitUntil: 'load' });

    const disabledClass = await disabledPage.evaluate(() =>
      document.documentElement.classList.contains('simply-dark')
    );
    expect(disabledClass).toBe(false);

    const disabledBg = await disabledPage.evaluate(() => {
      const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
      const htmlNums = htmlBg.match(/\d+(\.\d+)?/g) || [];
      const htmlAlpha = htmlNums.length === 4 ? Number(htmlNums[3]) : 1;
      if (htmlAlpha > 0 && Number(htmlNums[0]) + Number(htmlNums[1]) + Number(htmlNums[2]) > 0) {
        return htmlBg;
      }
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(parseRgbSum(disabledBg)).toBeGreaterThan(400);

    guards.forEach((assertClean) => assertClean());
  } finally {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
