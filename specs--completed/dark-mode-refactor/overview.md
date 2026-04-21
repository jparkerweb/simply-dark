# Simply Dark Refactor — Overview

**Created:** 2026-04-21
**Source:** [PLAN-DRAFT-20260421.md](./PLAN-DRAFT-20260421.md)
**Status:** Not Started

---

## Summary

Refactor the `Simply Dark` MV3 Chrome extension at `C:\git\simply-dark\` from a race-prone, dead-code-ridden implementation into a minimal, FOUC-free per-domain dark-mode tool. The end state is one class-gated stylesheet applied at `document_start`, a ~40-line content script, a thin service worker for migration + keyboard command, and a popup that writes directly to `chrome.storage.local` with all contexts coordinating via `storage.onChanged`.

---

## Tech Stack

| Category | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Chrome Manifest V3 | manifest_version 3 | Only supported option. |
| Language | Vanilla JavaScript | ES2022 | Codebase is ~250 lines post-refactor; TS adds friction, not safety. |
| CSS | Plain CSS + custom properties | — | Single gated stylesheet; no preprocessor needed. |
| Storage | `chrome.storage.local` | — | Fast, no quota, eliminates sync/local split bug. |
| Test runner | `@playwright/test` | `^1.47.0` | First-class extension loading; user mandate. |
| Packaging | `archiver` (existing `package.js`) | `^7.0.1` | Already in repo; only file list needs pruning. |
| Node scripts | npm `test`, `test:install`, `package` | — | Matches existing `package.json` pattern. |
| Lint/CI/i18n | None | — | Out of scope. |

---

## Architecture

### Pattern

**Class-gated static CSS + `chrome.storage.onChanged` bus.** A single stylesheet scoped to `html.simply-dark` is injected at `document_start` via the manifest. The content script's sole job is to add/remove that class and set four CSS variables on `documentElement`. Popup, content script, and service worker coordinate exclusively through `chrome.storage.local` writes + `onChanged` listeners. No runtime messaging, no tab reloads.

### Component Overview

| Component | Responsibility | Reads | Writes |
|---|---|---|---|
| `manifest.json` | Single content script @ `document_start` with `dark-mode.css`; commands; minimal perms | — | — |
| `dark-mode.css` | All visual rules gated on `html.simply-dark`; uses `--sd-*` vars with defaults | — | — |
| `content.js` (~40 lines) | Load storage; apply class + CSS vars; live-react to `onChanged` | `local.{domains,colors}` | `documentElement.classList`, inline CSS vars |
| `background.js` (~25 lines) | `onInstalled` migration; `onCommand` toggle | `sync.*`, `local.domains`, active tab | `local.{domains,colors}`, `sync.clear()` |
| `popup.html` | Static UI shell | — | — |
| `popup.js` (~60 lines) | Render from storage; mutate on input; live-sync via `onChanged` | `local.{domains,colors}`, active tab | `local.{domains,colors}` |
| `popup.css` | Popup styling (unchanged) | — | — |
| `package.js` | Zip builder (file list pruned) | Source files | `chrome store/simply-dark.zip` |
| `tests/*.spec.js` | Playwright signoff specs (A/B/C/D) | Running extension | — |
| `tests/helpers/extension.js` | Launch Chromium with unpacked extension loaded | — | — |
| `playwright.config.js` | Playwright runner config | — | — |

### Data Model — `chrome.storage.local`

```json
{
  "domains": { "example.com": true, "foo.com": false },
  "colors":  { "bg": "#121212", "text": "#e4e4e4", "link": "#3391ff", "border": "#555555" }
}
```

- Domain key canonical form: `hostname.replace(/^www\./, '')`.
- `colors` absent ⇒ CSS defaults baked into `dark-mode.css`.
- No other keys exist post-migration.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Async `storage.local.get` at `document_start` still leaks a subframe of light on slow machines | Med | Low | Manifest-declared CSS is injected pre-paint; class flip happens before `<body>`. Test confirms via `requestAnimationFrame` sampling. |
| `!important` in universal selector breaks sites with syntax highlighters or code colors | Med | Med | Exclude `pre, code, a, img, video, canvas, picture` via `:not(...)`. README note covers edge cases. |
| Service worker cold-start latency on keyboard command | Low | Low | Single storage write; ~50 ms imperceptible. |
| Playwright can't trigger real `chrome.commands` shortcuts in automation | Med | Low | Test the storage-flip side effect directly via an extension helper page; document manual shortcut verification in README. |
| Popup HTML input IDs don't match new color key names | Low | Med | Task C.1 inspects HTML first; JS maps IDs → new keys. Test C.3 fails loudly on miswiring. |
| Legacy `sync` data syncs back after migration clear | Low | Low | Migration is idempotent; `sync.clear()` replicates empty state across devices on next sync. |
| Playwright extension loading requires headed Chromium (CI friction) | Low | Low | Local-only test execution; CI out of scope. |
| User's popup opens in a new window via Playwright and loses `chrome.tabs.query({active:true})` context | Med | Med | Use `?testDomain=` query param path or pre-inject `chrome.tabs.query` stub in popup for tests. |

---

## Success Criteria

- All four Playwright signoff specs pass: `a-foundation`, `b-background`, `c-popup`, `d-packaging-and-fouc`.
- `node package.js` produces a zip containing exactly: `manifest.json`, `background.js`, `content.js`, `dark-mode.css`, `popup.html`, `popup.js`, `popup.css`, `images/*`.
- Repo no longer contains `earlyDarkMode.js` or `domainPreferences.js`.
- `manifest.json` declares only `activeTab` + `storage` permissions; no `host_permissions`; no custom CSP.
- Grep for `console.log` in `background.js`, `content.js`, `popup.js`, `dark-mode.css` returns zero hits.
- FOUC sample confirms dark at first paint on enabled domains.
- Reverse-FOUC sample confirms no flash of dark on disabled domains.
- `www.example.com` and `example.com` share one `domains` entry.
- Popup live-syncs via `onChanged` without tab reload.
- Keyboard toggle command flips `local.domains[domain]` (verified via storage assertion).
- `manifest.json` version is `1.3.0`.

---

## Phase Checklist

- [x] [Phase A — Foundation](./phase-1.md) — CSS + content script + manifest rewrite; dead files deleted
- [x] [Phase B — Service Worker](./phase-2.md) — `onInstalled` migration + keyboard command
- [x] [Phase C — Popup Rewrite](./phase-3.md) — Storage-direct popup with live-sync
- [x] [Phase D — Packaging, FOUC Verification, Console Hygiene](./phase-4.md) — Shippable zip + sitewide gates

---

## Parallel Execution Groups

| Group | Phases | Reason |
|-------|--------|--------|
| Sequential | A | Foundation — all subsequent phases depend on the storage schema and content script. |
| A (parallel) | B, C | Disjoint files (`background.js` vs `popup.js` / `popup.html`); both depend only on Phase A's storage schema; no shared state mutation. |
| Sequential | D | Packaging + sitewide quality gates require A, B, and C complete. |

---

## Quick Reference

### Key Files

| Path | Role |
|---|---|
| `C:\git\simply-dark\manifest.json` | MV3 manifest (rewritten in A.3) |
| `C:\git\simply-dark\dark-mode.css` | Class-gated stylesheet (rewritten in A.1) |
| `C:\git\simply-dark\content.js` | Content script (rewritten in A.2) |
| `C:\git\simply-dark\background.js` | Service worker (rewritten in B.1) |
| `C:\git\simply-dark\popup.html` | Popup shell (IDs preserved: `backgroundColor`, `textColor`, `linkColor`, `borderColor`) |
| `C:\git\simply-dark\popup.js` | Popup controller (rewritten in C.2) |
| `C:\git\simply-dark\popup.css` | Popup styling (unchanged) |
| `C:\git\simply-dark\package.js` | Zip builder (pruned in D.1) |
| `C:\git\simply-dark\package.json` | Adds Playwright + scripts (D.2) |
| `C:\git\simply-dark\playwright.config.js` | Created in D.3 |
| `C:\git\simply-dark\tests\helpers\extension.js` | Created in D.4 |
| `C:\git\simply-dark\tests\*.spec.js` | Signoff specs per phase |

### Files to Delete

- `C:\git\simply-dark\earlyDarkMode.js`
- `C:\git\simply-dark\domainPreferences.js`

### Environment Variables

None. Extension is pure client-side.

### External Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `archiver` | `^7.0.1` | Zip packaging (already present) |
| `@playwright/test` | `^1.47.0` | E2E testing (added in D.2) |

---

## Completion Summary

**Feature:** Simply Dark Refactor | **Completed:** 2026-04-21 | **Completion:** 100% (15/15)

### What Was Built

Refactored Simply Dark from a race-prone, dead-code-ridden MV3 extension into a minimal, FOUC-free per-domain dark-mode tool. A single class-gated `dark-mode.css` is injected at `document_start` via the manifest; `content.js` (~40 lines) toggles `html.simply-dark` and four CSS variables from `chrome.storage.local`; popup, service worker, and content script coordinate exclusively via `storage.onChanged`. Added a Playwright signoff suite covering foundation, service worker, popup live-sync, and packaging/FOUC.

### Files Created

| File | Purpose |
|------|---------|
| `playwright.config.js` | Playwright runner config (single `chromium-ext` project, headed) |
| `tests/helpers/extension.js` | `launchWithExtension()` + `seedStorage()` helpers |
| `tests/a-foundation.spec.js` | Phase A signoff |
| `tests/b-background.spec.js` | Phase B signoff |
| `tests/c-popup.spec.js` | Phase C signoff |
| `tests/d-packaging-and-fouc.spec.js` | Phase D signoff (FOUC + zip contents) |

### Files Modified

| File | Changes |
|------|---------|
| `manifest.json` | v1.3.0; perms → `activeTab`,`storage`; single `document_start` content script with `dark-mode.css`; dropped `host_permissions`/`tabs`/CSP |
| `dark-mode.css` | Rewritten as class-gated stylesheet under `html.simply-dark` using `--sd-{bg,text,link,border}` with defaults |
| `content.js` | Rewritten (~40 lines): apply class + CSS vars from storage; live-react to `onChanged` |
| `background.js` | Rewritten (~25 lines): `onInstalled` migration from legacy sync; `onCommand` keyboard toggle |
| `popup.js` | Rewritten (~60 lines): storage-direct reads/writes; live-sync via `onChanged` |
| `package.js` | Pruned `files` array (removed `earlyDarkMode.js`, `domainPreferences.js`) |
| `package.json` | Added `@playwright/test` devDep and `test` / `test:install` / `package` scripts |

### Files Deleted

- `earlyDarkMode.js`
- `domainPreferences.js`

### Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | `^1.47.0` | E2E testing (extension loading) |

### Configuration Required

None. Extension is pure client-side; no env vars.

### Known Limitations

- Playwright cannot trigger real `chrome.commands` shortcuts in automation; keyboard toggle is verified via the underlying storage-flip path, with manual shortcut verification documented as out-of-scope.
- Test suite is local-only (headed Chromium); CI integration is out of scope.


<!-- METRICS_JSON {"step": "document", "total_tasks": 14, "tasks_per_phase": [5, 2, 3, 5], "phase_count": 4, "parallel_groups_identified": 1, "verification_items_added": 0} -->
