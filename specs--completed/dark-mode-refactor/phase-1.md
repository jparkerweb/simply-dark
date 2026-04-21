# Phase A — Foundation

**Status:** Complete
**Estimated Tasks:** 5

## Overview

Replace the styling core. After Phase A, a page on an enabled domain renders dark at first paint with no JS-injected styles, no MutationObserver, and no reflow hacks. The stylesheet ships via the manifest at `document_start`, and `content.js` only toggles a single class + four CSS variables.

## Prerequisites

- Clean working tree on `main`.
- `archiver` already in `package.json` (verified).
- Legacy `chrome.storage.sync` data may still exist on the user's profile — Phase B handles migration; Phase A tests seed `chrome.storage.local` directly.

## Tasks

### Styling core

- [x] **Task A.1:** Rewrite `C:\git\simply-dark\dark-mode.css` as a single class-gated stylesheet.
  - Gate every rule on `html.simply-dark` (never apply globally).
  - Define CSS custom properties on `html.simply-dark` with defaults: `--sd-bg: #121212; --sd-text: #e4e4e4; --sd-link: #3391ff; --sd-border: #555555;`.
  - Apply `background-color: var(--sd-bg) !important; color: var(--sd-text) !important;` on `html.simply-dark`, `html.simply-dark body`, and a universal-selector variant that excludes `a, img, video, canvas, picture, pre, code` using `:not(...)`.
  - Apply `color: var(--sd-link) !important;` to `html.simply-dark a`.
  - Apply `border-color: var(--sd-border) !important;` to a universal-selector variant with the same exclusion list.
  - No other rules. No `@media`. No imports.

### Content script

- [x] **Task A.2:** Rewrite `C:\git\simply-dark\content.js` (~40 lines, no dependencies).
  - Compute canonical domain: `location.hostname.replace(/^www\./, '')`.
  - Define `apply(enabled, colors)`:
    - If `enabled`, add `simply-dark` class to `document.documentElement`; else remove it.
    - If `colors` present, set `documentElement.style.setProperty('--sd-bg', colors.bg)` etc. for all four keys; if absent, remove those inline properties so CSS defaults take effect.
  - Define `loadAndApply()`: `chrome.storage.local.get(['domains', 'colors'])` → `apply(!!domains?.[domain], colors)`.
  - Call `loadAndApply()` immediately at script start (no `DOMContentLoaded` wait — script runs at `document_start`).
  - Subscribe `chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.domains || changes.colors)) loadAndApply(); })`.
  - Zero `console.*` statements. No MutationObserver, no `<style>` injection, no full-DOM iteration, no forced reflow.

### Manifest

- [x] **Task A.3:** Rewrite `C:\git\simply-dark\manifest.json`.
  - `manifest_version: 3`, `name: "Simply Dark"`, `version: "1.3.0"`, `description`, `author` unchanged.
  - `permissions: ["activeTab", "storage"]`. Remove `"tabs"`.
  - Remove entire `host_permissions` array.
  - Remove entire `content_security_policy` block.
  - Keep `action` block with popup + default icons.
  - Keep top-level `icons` block.
  - Keep `background.service_worker: "background.js"`.
  - Keep `commands.toggle-dark-mode` with the same description.
  - `content_scripts`: exactly ONE entry: `{ "matches": ["<all_urls>"], "run_at": "document_start", "js": ["content.js"], "css": ["dark-mode.css"] }`. Remove the previous second `document_idle` entry and the `earlyDarkMode.js` entry.

### Dead code removal

- [x] **Task A.4:** Delete the legacy early-mode and domain-preferences files.
  - Delete `C:\git\simply-dark\earlyDarkMode.js`.
  - Delete `C:\git\simply-dark\domainPreferences.js`.
  - Grep the repo to confirm no remaining references to `earlyDarkMode` or `domainPreferences` in any JS, JSON, or HTML file.

### Signoff

- [x] **Task A.5 (Signoff):** Write and pass `C:\git\simply-dark\tests\a-foundation.spec.js`.
  - Use the (yet-to-be-built in D.4) pattern: `chromium.launchPersistentContext(tmpDir, { headless: false, args: ['--disable-extensions-except=<repoRoot>', '--load-extension=<repoRoot>'] })`. For Phase A, inline a minimal helper at the top of the spec; the reusable helper is formalized in Phase D.
  - Discover the extension ID by reading `context.serviceWorkers()[0].url()` (retry for up to 2s if not yet registered).
  - Open `chrome-extension://<id>/popup.html` and `await page.evaluate(() => chrome.storage.local.set({ domains: { 'example.com': true } }))`.
  - Open a new tab to `https://example.com/`; wait for `load`.
  - Assert `document.documentElement.classList.contains('simply-dark') === true`.
  - Assert `getComputedStyle(document.documentElement).backgroundColor` parses to RGB with sum of channels < 180 (dark).
  - Assert `getComputedStyle(document.documentElement).getPropertyValue('--sd-bg').trim() === '#121212'`.
  - Open a new tab to `https://en.wikipedia.org/`; wait for `load`.
  - Assert `classList.contains('simply-dark') === false`.
  - Assert background channel sum > 400 (light).
  - Attach `page.on('console', ...)` BEFORE navigation on every page; assert zero console messages whose stack trace or `location.url` starts with `chrome-extension://<id>/`.

## Phase Testing

Phase A signoff is Task A.5 (above). The phase is not complete until `tests/a-foundation.spec.js` passes via `npx playwright test tests/a-foundation.spec.js --headed`.

## Acceptance Criteria

- `dark-mode.css` contains rules gated ONLY on `html.simply-dark` and defines all four `--sd-*` custom properties with defaults.
- `content.js` is ≤ ~60 lines, contains no `console.*`, and subscribes exactly once to `chrome.storage.onChanged`.
- `manifest.json` declares exactly one `content_scripts` entry at `document_start` with both `js` and `css`.
- `manifest.json` permissions array is exactly `["activeTab", "storage"]`; no `host_permissions`; no `content_security_policy`.
- `manifest.json` version is `1.3.0`.
- `earlyDarkMode.js` and `domainPreferences.js` no longer exist in the repo; no references remain.
- `tests/a-foundation.spec.js` passes.

## Notes

- Phase A leaves `background.js` and `popup.js` in their pre-refactor state; tests seed `chrome.storage.local` directly. Phase B/C replace those files.
- The `:not(a, img, video, canvas, picture, pre, code)` exclusion is the agreed mitigation for syntax-highlighted code blocks and media elements — do not narrow it without updating the plan.

## Phase Completion Summary

- Rewrote `dark-mode.css` as a single class-gated stylesheet scoped to `html.simply-dark` with four `--sd-*` CSS custom property defaults.
- Rewrote `content.js` to ~38 lines: canonical domain, `apply(enabled, colors)`, immediate `loadAndApply()`, `storage.onChanged` subscription, zero `console.*`.
- Rewrote `manifest.json`: version `1.3.0`, permissions `["activeTab", "storage"]`, no `host_permissions`, no `content_security_policy`, single `document_start` content script with both `js` and `css`.
- Deleted `earlyDarkMode.js` and `domainPreferences.js`. Remaining references exist only in `PLAN.md` (historical planning doc, intentionally preserved).
- Removed stale `domainPreferences.js` / `earlyDarkMode.js` entries from `package.js` file list (minimal touch; full pruning deferred to Phase D.1).
- Installed `@playwright/test@^1.47.0` (formal wiring deferred to Phase D.2) to execute the signoff test.
- Created and passed `tests/a-foundation.spec.js` verifying dark on `example.com`, light on `en.wikipedia.org`, `--sd-bg=#121212`, and zero extension-origin console messages.

**Spec notes:**
- Disabled-page background assertion falls back from `documentElement` to `body` when html is transparent (Wikipedia's default). Threshold `sum > 400` unchanged.
- Storage seeding uses the service worker rather than opening `popup.html`, because legacy `popup.js` (untouched in Phase A per spec) throws on direct load and would violate the zero-console-error gate. Phase C rewrites popup.js.
