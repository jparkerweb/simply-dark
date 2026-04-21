module.exports = {
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    { name: 'chromium-ext' }
  ]
};
