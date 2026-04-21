# Phase D — Packaging, FOUC Verification, Console Hygiene

**Status:** Complete
**Estimated Tasks:** 5

## Overview

Finalize the ship-ready artifacts and run sitewide quality gates: pruned zip contents, Playwright infrastructure, FOUC / reverse-FOUC sampling under a throttled network, `www.` coalescing end-to-end, and a zero-extension-console-output assertion.

## Prerequisites

- Phases A, B, C complete; their signoff specs pass.
- `earlyDarkMode.js` and `domainPreferences.js` deleted (done in A.4).
- `manifest.json` version is `1.3.0` (done in A.3).

## Tasks

### Packaging

- [x] **Task D.1:** Update `C:\git\simply-dark\package.js` — prune the `files` array.
  - Remove `'earlyDarkMode.js'` and `'domainPreferences.js'` from the array.
  - Final `files` array: `['background.js', 'content.js', 'dark-mode.css', 'manifest.json', 'popup.css', 'popup.html', 'popup.js']`.
  - Leave the `archive.directory('images', 'images')` line untouched.
  - Consider dropping the two `console.log` calls in the close handler, or leave them — they run in Node at build time only, not in the extension. Plan spec (`NFR-4`) targets runtime files; build scripts are out of scope. Leave as-is unless implementer prefers to remove.

### npm scripts + dev dependency

- [x] **Task D.2:** Update `C:\git\simply-dark\package.json`.
  - Add top-level `"scripts": { "test": "playwright test", "test:install": "playwright install chromium", "package": "node package.js" }`.
  - Add top-level `"devDependencies": { "@playwright/test": "^1.47.0" }`.
  - Keep existing `"dependencies": { "archiver": "^7.0.1" }`.
  - Run `npm install` after editing to populate `node_modules` and update `package-lock.json`.

### Playwright config

- [x] **Task D.3:** Create `C:\git\simply-dark\playwright.config.js`.
  - Use CommonJS (`module.exports = { ... }`) to match the rest of the repo.
  - `testDir: 'tests'`.
  - `fullyParallel: false` (extension context is single).
  - `workers: 1`.
  - `retries: 0`.
  - `reporter: 'list'`.
  - `use: { headless: false, viewport: { width: 1280, height: 720 } }`.
  - Single project: `projects: [{ name: 'chromium-ext' }]`.

### Extension helper

- [x] **Task D.4:** Create `C:\git\simply-dark\tests\helpers\extension.js`.
  - Export `async function launchWithExtension()`:
    - Compute `const root = path.resolve(__dirname, '..', '..');`.
    - Create a unique temp `userDataDir` via `fs.mkdtempSync(path.join(os.tmpdir(), 'simply-dark-'))`.
    - `const context = await chromium.launchPersistentContext(userDataDir, { headless: false, args: ['--disable-extensions-except=' + root, '--load-extension=' + root, '--no-first-run', '--no-default-browser-check'] });`
    - Resolve `extensionId` by polling `context.serviceWorkers()` for up to 5 s; fall back to opening `chrome://extensions` and scraping the ID if no SW is registered (unlikely but defensive).
    - Return `{ context, extensionId, userDataDir }`.
  - Export `async function seedStorage(context, extensionId, data)`:
    - Open `chrome-extension://<extensionId>/popup.html` as a page; `await page.evaluate(d => chrome.storage.local.set(d), data)`; close the page.
  - Export `async function readStorage(context, extensionId)`:
    - Same popup-page pattern; returns `chrome.storage.local.get(null)`.
  - Export `async function attachConsoleGuard(page, extensionId)`:
    - Record any `console` message whose `location().url` starts with `chrome-extension://<extensionId>/`; return a function that asserts the array is empty.
  - Refactor the inline helpers from `tests/a-foundation.spec.js`, `tests/b-background.spec.js`, and `tests/c-popup.spec.js` to use these exports.

### Signoff

- [x] **Task D.5 (Signoff):** Write and pass `C:\git\simply-dark\tests\d-packaging-and-fouc.spec.js`.
  - **Packaging assertion:**
    - `require('child_process').execSync('node package.js', { cwd: repoRoot })`.
    - Open the resulting `chrome store/simply-dark.zip` with a lightweight reader. If `unzipper` is not desired as a dep, use `yauzl` or a one-shot `execSync('unzip -l ...')` on systems that have it — but on Windows, prefer `adm-zip` (add to devDependencies if needed). Choose ONE: `adm-zip ^0.5.0` is recommended for cross-platform Windows compatibility; add it to `devDependencies` in Task D.2 if selected.
    - Collect entry names; assert the set (ignoring directory entries) equals exactly: `['background.js', 'content.js', 'dark-mode.css', 'manifest.json', 'popup.css', 'popup.html', 'popup.js', 'images/icon16.png', 'images/icon48.png', 'images/icon128.png']`. `images/options.png` is permitted if present in the repo.
    - Assert `earlyDarkMode.js` and `domainPreferences.js` are NOT in the zip.
  - **FOUC fixture server:**
    - Spin up a local Node HTTP server (bound to `127.0.0.1` on an ephemeral port) that responds to `/` with HTML preceded by a 200 ms server-side delay before streaming `<body>`. The response should render a plain white background via default UA styles.
    - Tear down after tests.
  - **FOUC (enabled):**
    - Launch extension; seed `domains: { '127.0.0.1': true }` (canonical form has no `www.` to strip).
    - Use CDP to throttle: `const client = await context.newCDPSession(page); await client.send('Network.enable'); await client.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 });`.
    - Add an init script via `page.addInitScript`: start sampling `getComputedStyle(document.documentElement).backgroundColor` in a `requestAnimationFrame` loop from the earliest script execution, pushing samples into `window.__fouc_samples` with timestamps.
    - Navigate to the fixture URL.
    - After load, read `__fouc_samples`; parse the FIRST sample's RGB; assert R + G + B < 180 (dark at first frame).
  - **Reverse-FOUC (disabled):**
    - Re-seed `domains: {}` (or omit the host).
    - Repeat sampling; assert NO sample during the first 500 ms falls in the dark range (R + G + B < 180).
  - **`www.` coalescing end-to-end:**
    - Open popup via `chrome-extension://<id>/popup.html?testDomain=example.com`; click the toggle ON.
    - Open a tab to `https://www.example.com/`; assert `document.documentElement.classList.contains('simply-dark') === true` within 1 s.
    - Assert `chrome.storage.local.get('domains')` contains exactly one key for `example.com` (no `www.example.com` key).
  - **Console hygiene sitewide:**
    - Install `attachConsoleGuard` on every page opened across all scenarios in this spec.
    - At test end, assert zero extension-origin console messages.

## Phase Testing

Phase D signoff is Task D.5. Run `npx playwright test tests/d-packaging-and-fouc.spec.js --headed`. Final acceptance: `npm test` runs all four specs and exits 0.

## Acceptance Criteria

- `node package.js` produces `chrome store/simply-dark.zip` with exactly the approved file list (plus `images/*`).
- `package.json` declares the three new scripts and `@playwright/test` devDependency.
- `playwright.config.js` exists with single-project, non-parallel, headed config.
- `tests/helpers/extension.js` exports `launchWithExtension`, `seedStorage`, `readStorage`, and `attachConsoleGuard`; Phase A/B/C specs are refactored to use them.
- FOUC sampling confirms dark at first frame on enabled domains under 400 kbps / 400 ms throttle.
- Reverse-FOUC sampling confirms no dark frame on disabled domains.
- `www.example.com` and `example.com` share a single `domains` entry after user toggles via popup.
- Zero extension-origin console messages across all four specs.
- Grep for `console.log` in `background.js`, `content.js`, `popup.js`, `dark-mode.css` returns zero hits (runtime files only; `package.js` build-time logs are out of scope).

## Notes

- The FOUC test's RGB threshold of 180 (channel sum) is intentionally permissive to avoid false failures on subpixel antialiasing; the real dark target is `#121212` (sum = 54). Do not tighten without re-measuring.
- If CDP network throttling proves flaky in headed Chromium, the backup strategy is to serve the fixture over a Node stream that `setTimeout`s each chunk by ~100 ms. Document whichever path is chosen.
- The packaging test's zip reader (`adm-zip` or equivalent) MUST go in `devDependencies`, not `dependencies` — do not ship it to end users.

## Phase Completion Summary

- **D.1** — Verified `package.js` already had the pruned `files` array (no stale entries present).
- **D.2** — Added `scripts` (`test`, `test:install`, `package`), added `adm-zip ^0.5.0` devDep for the packaging assertion, and ran `npm install`.
- **D.3** — Created `playwright.config.js` with single-project, non-parallel, headed, list-reporter CommonJS config.
- **D.4** — Added `tests/helpers/extension.js` exporting `launchWithExtension`, `seedStorage`, `readStorage`, `attachConsoleGuard`; refactored A/B/C specs to consume it.
- **D.5** — Wrote `tests/d-packaging-and-fouc.spec.js` with: packaging zip assertion, 200 ms-delay local fixture server, CDP-throttled FOUC sampling (enabled), reverse-FOUC sampling (disabled), www→apex coalescing via popup toggle, sitewide extension-console guard.

**Deviation from spec:**
- Sampler exclusion for `rgba(…, 0)` (transparent) backgrounds: the spec's raw `R+G+B < 180` check treats the browser's default transparent-html state as "dark" (sum = 0). Updated both enabled and disabled samplers to ignore alpha=0 samples when deciding dark/not-dark. Matches the plan's intent (`#121212` sum 54 target) without loosening the 180 threshold.
- Added a pre-seed wait-loop: on fresh profiles `onInstalled` migration races any `chrome.storage.local.set` seed. Poll for `sync` empty + `local.domains` key present before seeding. This is defensive test infrastructure, not a product change.
- Sampling window extended to 3 s with a 20 ms `setInterval` backup (RAF stalls during throttled network waits). First paint still sampled; threshold untouched.

**Test results:** `npm test` — 6/6 passing. Playwright specs: `a-foundation`, `b-background` (2), `c-popup`, `d-packaging-and-fouc` (2).

**Console hygiene:** Grep for `console.log` in `background.js`, `content.js`, `popup.js`, `dark-mode.css` returned zero hits.
