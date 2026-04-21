# Phase C — Popup Rewrite

**Status:** Complete
**Estimated Tasks:** 3

## Overview

Rewrite the popup so it reads from and writes directly to `chrome.storage.local`, with no `chrome.runtime.sendMessage` and no tab reloads. The popup also subscribes to `chrome.storage.onChanged` so external toggles (keyboard command, another tab's popup) update the open popup UI live.

## Prerequisites

- Phase A complete: storage schema `{ domains, colors }` is canonical and `content.js` reacts to changes.
- `popup.html` input IDs confirmed: `darkModeToggle`, `currentDomain`, `backgroundColor`, `textColor`, `linkColor`, `borderColor`, `saveColors`, `resetColors` (inspected during Task C.1).
- Color-key JS-level mapping: `{ backgroundColor: 'bg', textColor: 'text', linkColor: 'link', borderColor: 'border' }`.

## Tasks

### HTML audit

- [x] **Task C.1:** Inspect `C:\git\simply-dark\popup.html` and finalize the ID → storage-key map in a comment block at the top of `popup.js`.
  - Do NOT rename HTML inputs (keep `backgroundColor`, `textColor`, `linkColor`, `borderColor`).
  - Define the constant `const COLOR_MAP = { backgroundColor: 'bg', textColor: 'text', linkColor: 'link', borderColor: 'border' };` in `popup.js`.
  - Default color constants: `{ bg: '#121212', text: '#e4e4e4', link: '#3391ff', border: '#555555' }`.

### Popup controller rewrite

- [x] **Task C.2:** Rewrite `C:\git\simply-dark\popup.js` (~60 lines, no imports).
  - Define `DEFAULTS = { bg: '#121212', text: '#e4e4e4', link: '#3391ff', border: '#555555' };`.
  - Define `COLOR_MAP` as above.
  - Define `async function getActiveDomain()`:
    - `const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });`
    - If `!tab?.url`, return `null`.
    - Return `new URL(tab.url).hostname.replace(/^www\./, '')` (null for non-URL schemes).
  - Define `async function render()`:
    - Run on `DOMContentLoaded`.
    - Compute `domain = await getActiveDomain()`.
    - If `domain`, set `document.getElementById('currentDomain').textContent = domain;` else display `"No active tab"` and disable the toggle.
    - Read `const { domains = {}, colors } = await chrome.storage.local.get(['domains', 'colors']);`.
    - Set `darkModeToggle.checked = !!domains[domain];`.
    - For each `[inputId, key] of Object.entries(COLOR_MAP)`, set the input value to `colors?.[key] ?? DEFAULTS[key]`.
    - Cache `currentDomain` on a module-scoped variable for use by event handlers.
  - Define `async function onToggleChange()`:
    - Read `const { domains = {} } = await chrome.storage.local.get('domains');`.
    - Set `domains[currentDomain] = !domains[currentDomain];` (use explicit flip, do not trust checkbox state in case of storage race).
    - Write `await chrome.storage.local.set({ domains });`.
    - Do NOT reload any tab. Do NOT call `chrome.runtime.sendMessage`.
  - Define `async function onSaveColors()`:
    - Build `colors` object from the four inputs via `COLOR_MAP`.
    - `await chrome.storage.local.set({ colors });`.
  - Define `async function onResetColors()`:
    - `await chrome.storage.local.remove('colors');`.
    - For each input, set its value back to `DEFAULTS[COLOR_MAP[inputId]]`.
  - Define `function syncUIFromStorage({ domains, colors })`:
    - If `domains` passed, update the toggle from `domains[currentDomain]`.
    - If `colors === undefined` (removed), reset inputs to `DEFAULTS`; else update each input from `colors[key] ?? DEFAULTS[key]`.
  - Wire listeners on `DOMContentLoaded`:
    - `darkModeToggle.addEventListener('change', onToggleChange);`
    - `saveColors.addEventListener('click', onSaveColors);`
    - `resetColors.addEventListener('click', onResetColors);`
    - `chrome.storage.onChanged.addListener((changes, area) => { if (area !== 'local') return; const patch = {}; if (changes.domains) patch.domains = changes.domains.newValue || {}; if (changes.colors) patch.colors = changes.colors.newValue; if ('domains' in patch || 'colors' in patch) syncUIFromStorage(patch); });`
  - Zero `console.*`. Zero `chrome.runtime.sendMessage`. Zero `chrome.tabs.reload`.

### Signoff

- [x] **Task C.3 (Signoff):** Write and pass `C:\git\simply-dark\tests\c-popup.spec.js`.
  - Launch extension; discover `extensionId`.
  - **Domain injection strategy:** before navigating the popup page, open a background tab to `https://example.com/` so that `chrome.tabs.query({active:true,currentWindow:true})` from the popup context still resolves (Playwright's popup is a regular page; `currentWindow` semantics may differ). If unreliable, use the `?testDomain=example.com` query-string escape hatch — in which case, add a one-line override at the top of `render()`: `const override = new URLSearchParams(location.search).get('testDomain'); if (override) return override;` inside `getActiveDomain()`. Document this override clearly; it is test-only but shipped.
  - **Scenario 1 — toggle writes and propagates:**
    - Seed `chrome.storage.local.set({ domains: { 'example.com': false } })` and ensure `colors` absent.
    - Open `chrome-extension://<id>/popup.html?testDomain=example.com` in one page.
    - Assert `#darkModeToggle.checked === false` and `#currentDomain.textContent === 'example.com'`.
    - Click the toggle.
    - Assert `chrome.storage.local.get('domains')` returns `{ domains: { 'example.com': true } }`.
    - In the already-open `https://example.com/` tab, poll up to 1 s: assert `document.documentElement.classList.contains('simply-dark') === true` WITHOUT any explicit reload.
  - **Scenario 2 — save colors applies live:**
    - In the popup, set `#backgroundColor` input value to `#222222` and dispatch an `input`/`change` event if needed.
    - Click `#saveColors`.
    - Assert `chrome.storage.local.get('colors')` returns `{ colors: { bg: '#222222', text: '#e4e4e4', link: '#3391ff', border: '#555555' } }` (other three inputs unchanged at defaults).
    - In the `example.com` tab, assert `getComputedStyle(document.documentElement).getPropertyValue('--sd-bg').trim() === '#222222'` within 1 s.
  - **Scenario 3 — reset clears colors:**
    - Click `#resetColors`.
    - Assert `chrome.storage.local.get('colors')` returns `{}` (key absent).
    - In the `example.com` tab, assert `--sd-bg` resolves to `#121212` (the CSS default) within 1 s.
    - Assert the popup's `#backgroundColor` input value is `#121212`.
  - **Scenario 4 — external change live-syncs popup:**
    - With the popup page still open, write `chrome.storage.local.set({ domains: { 'example.com': false } })` from a separate page (e.g. the `example.com` tab via `chrome.storage.local.set`, or an extra extension page).
    - Poll the popup: assert `#darkModeToggle.checked === false` within 1 s.
  - Attach `page.on('console', ...)` to every page; assert no extension-origin console output.

## Phase Testing

Phase C signoff is Task C.3. Run `npx playwright test tests/c-popup.spec.js --headed`.

## Acceptance Criteria

- `popup.js` contains NO `chrome.runtime.sendMessage`, NO `chrome.tabs.reload`, and NO `console.*`.
- `popup.js` subscribes exactly once to `chrome.storage.onChanged` and updates the UI when `domains` or `colors` change externally.
- Toggle / Save / Reset each perform a single `chrome.storage.local.{set,remove}` call.
- All four color inputs map through `COLOR_MAP` (HTML IDs preserved).
- Missing `colors` key in storage renders CSS defaults in the popup inputs.
- `tests/c-popup.spec.js` passes.

## Notes

- The `?testDomain=` override in `getActiveDomain()` is an intentional concession for Playwright; it ships but is a no-op unless the query string is present. If this is rejected during implementation, the fallback is to stub `chrome.tabs.query` via `page.addInitScript` before popup scripts execute.
- Do NOT rename HTML input IDs; the HTML file stays stable and the JS owns the mapping.

## Phase Completion Summary

- `popup.js` rewritten (~95 lines) reading/writing `chrome.storage.local` directly; zero `chrome.runtime.sendMessage`, `chrome.tabs.reload`, or `console.*`.
- `COLOR_MAP` + `DEFAULTS` defined at top; ID → storage-key mapping documented in header comment. HTML input IDs unchanged.
- `getActiveDomain()` includes the `?testDomain=` override early-return (shipped, no-op without query param) to support Playwright.
- `chrome.storage.onChanged` listener registered once; live-updates toggle + color inputs when `domains` or `colors` change externally.
- Toggle handler does explicit flip from storage (not checkbox state) to avoid storage races.
- `tests/c-popup.spec.js` created following the `b-background.spec.js` pattern (self-contained launcher; no `tests/helpers/` yet — that's Phase D). All four scenarios in one test: toggle → storage → content-script class; save colors → CSS var on site; reset → `colors` key removed + CSS default restored + input reverts; external write → popup live-syncs. Passes in 1.0s headed.
- Zero extension-origin console output observed.
