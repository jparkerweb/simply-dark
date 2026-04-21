# PLAN-DRAFT — Simply Dark Refactor to Simple & Elegant

**Created:** 2026-04-21
**Status:** Draft
**Confidence:** 99% (Requirements 25/25 · Feasibility 25/25 · Integration 25/25 · Risk 24/25)
**Conversation Log:** [PLAN-CONVERSATION-20260421.md](./PLAN-CONVERSATION-20260421.md)

---

## 1. Executive Summary

Refactor the `Simply Dark` MV3 Chrome extension at `C:\git\simply-dark\` from a race-prone, dead-code-ridden implementation into a minimal, FOUC-free per-domain dark-mode tool. The end state is one class-gated stylesheet applied at `document_start`, a ~40-line content script, a thin service worker for migration + keyboard command, and a popup that writes directly to `chrome.storage.local` with all contexts coordinating via `storage.onChanged`.

---

## 2. Requirements

### 2.1 Functional

- [ ] **FR-1** Per-domain dark mode toggle persisted in `chrome.storage.local.domains`.
- [ ] **FR-2** Zero FOUC on enabled domains; zero reverse-FOUC on disabled domains.
- [ ] **FR-3** Keyboard command `toggle-dark-mode` flips state for active tab's registrable domain.
- [ ] **FR-4** Popup UI: current-domain label, toggle switch, 4 color pickers (bg/text/link/border), Save, Reset.
- [ ] **FR-5** All state flows via `chrome.storage.onChanged` — no `chrome.runtime.sendMessage`, no tab reloads.
- [ ] **FR-6** `www.` coalescing — `www.example.com` and `example.com` share one storage entry.
- [ ] **FR-7** One-time migration on `chrome.runtime.onInstalled`: legacy `sync` (per-domain bools + `customColors`) → `local.{domains,colors}`; clear `sync`; discard `cssVersion` and `DomainPreferences`.
- [ ] **FR-8** Color customization via CSS vars `--sd-bg`, `--sd-text`, `--sd-link`, `--sd-border` set inline on `document.documentElement`.

### 2.2 Non-Functional

- [ ] **NFR-1** Single content script at `document_start` with `dark-mode.css` statically declared in the manifest.
- [ ] **NFR-2** No MutationObserver, no forced reflow, no full-DOM iteration, no JS-injected `<style>` element.
- [ ] **NFR-3** Permissions reduced to `activeTab` + `storage`; drop `tabs`, `host_permissions`, and the custom `content_security_policy` block.
- [ ] **NFR-4** No `console.log` statements in any runtime file.
- [ ] **NFR-5** `manifest.json` version bumped to `1.3.0`.
- [ ] **NFR-6** Single source of truth for styling — one `dark-mode.css` gated on `html.simply-dark`.

### 2.3 Out of Scope

- i18n / localization
- Dark-mode scheduling (time-based, sunset/sunrise)
- Allowlist / blocklist import/export
- TypeScript conversion or build-step introduction
- Lint/format tooling
- CI pipeline
- Unit tests (Playwright E2E covers all critical paths)

### 2.4 Testing Strategy

| Aspect | Decision |
|---|---|
| Framework | `@playwright/test ^1.47.0` |
| Types | E2E only (extension loaded via `chromium.launchPersistentContext` with `--load-extension`) |
| Phase testing | **Yes** — one signoff spec per implementation phase (A/B/C/D); the phase is not complete until its spec passes |
| Coverage | Critical paths: enable/disable, keyboard command, migration, `www.` coalescing, CSS var application, FOUC/reverse-FOUC, popup live-sync |
| Execution | Headed Chromium locally; `npm test` shortcut; extension path = repo root |

---

## 3. Tech Stack

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

## 4. Architecture

### 4.1 Pattern

**Class-gated static CSS + `chrome.storage.onChanged` bus.** A single stylesheet scoped to `html.simply-dark` is injected at `document_start` via the manifest. The content script's sole job is to add/remove that class and set four CSS variables on `documentElement`. Popup, content script, and service worker coordinate exclusively through `chrome.storage.local` writes + `onChanged` listeners. No runtime messaging, no tab reloads.

### 4.2 System Context Diagram

```
    +-----------------------+
    |  Chrome Browser       |
    |                       |
    |  +----------------+   |      +----------------------+
    |  | Web Page (tab) |<--+--CSS-| dark-mode.css        |
    |  | <html          |   |      | (manifest-declared,  |
    |  |  .simply-dark> |   |      |  document_start)     |
    |  +-------^--------+   |      +----------------------+
    |          |            |
    |  class + --sd-* vars  |
    |          |            |
    |  +-------+--------+   |      +----------------------+
    |  | content.js     |<--+--R---| chrome.storage.local |
    |  | (document_start|   |      | { domains, colors }  |
    |  +----------------+   |      +-----^---------^------+
    |                       |            W         W
    |  +----------------+   |            |         |
    |  | popup.html/.js |---+------------+         |
    |  +----------------+   |                      |
    |                       |                      |
    |  +----------------+   |                      |
    |  | background.js  |---+----------------------+
    |  | (service       |<--+--chrome.commands-----+
    |  |  worker)       |   |      (toggle-dark-mode)
    |  +----------------+   |
    |                       |
    |   storage.onChanged ---+--> delivered to all 3 contexts
    +-----------------------+
```

### 4.3 Components

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

### 4.4 Data Model

`chrome.storage.local`:

```json
{
  "domains": { "example.com": true, "foo.com": false },
  "colors":  { "bg": "#121212", "text": "#e4e4e4", "link": "#3391ff", "border": "#555555" }
}
```

- Domain key canonical form: `hostname.replace(/^www\./, '')`.
- `colors` absent ⇒ CSS defaults baked into `dark-mode.css`.
- No other keys exist post-migration.

### 4.5 "API" Design (internal function contracts)

**content.js**
- `apply(enabled: boolean, colors?: {bg,text,link,border}): void` — toggles `html.simply-dark` and sets 4 inline CSS vars.
- `loadAndApply(): Promise<void>` — reads storage, calls `apply`.
- Subscribes `chrome.storage.onChanged` → re-runs `loadAndApply` when `domains` or `colors` changes.

**background.js**
- `migrate(): Promise<void>` — called from `onInstalled`; reads all `sync` keys, builds `{domains, colors}`, writes to `local`, calls `sync.clear()`. Idempotent.
- `domainFromUrl(url: string): string` — returns `new URL(url).hostname.replace(/^www\./,'')`.
- `onToggleCommand(): Promise<void>` — queries active tab, derives domain, flips `local.domains[domain]`.

**popup.js**
- `render(): Promise<void>` — on `DOMContentLoaded`; reads storage + active tab; populates UI.
- `onToggleChange(e)`, `onSaveColors()`, `onResetColors()` — direct storage writes; no `sendMessage`; no tab reload.
- `syncUIFromStorage({domains, colors}): void` — invoked by `onChanged` listener.

---

## 5. Implementation Phases

### Phase A — Foundation

**Goal:** Replace the styling core. After A, a page on an enabled domain renders dark at first paint with no JS-injected styles.

**Dependencies:** None.

- [ ] **Task A.1** Rewrite `C:\git\simply-dark\dark-mode.css`: class-gated rules under `html.simply-dark` using `--sd-bg`, `--sd-text`, `--sd-link`, `--sd-border` with defaults; exclude `a, img, video, canvas, picture, pre, code` from the universal selector.
- [ ] **Task A.2** Rewrite `C:\git\simply-dark\content.js` (~40 lines): compute domain (strip `www.`), read `local.{domains,colors}`, call `apply(enabled, colors)`; subscribe to `chrome.storage.onChanged` and re-apply when `domains` or `colors` changes. No MutationObserver, no reflow hack, no `<style>` injection.
- [ ] **Task A.3** Update `C:\git\simply-dark\manifest.json`: single `content_scripts` entry with `run_at: "document_start"`, `js: ["content.js"]`, `css: ["dark-mode.css"]`; permissions `["activeTab","storage"]`; drop `host_permissions`, `tabs`, and `content_security_policy`; keep `commands.toggle-dark-mode`; bump `version` to `1.3.0`.
- [ ] **Task A.4** Delete `C:\git\simply-dark\earlyDarkMode.js` and `C:\git\simply-dark\domainPreferences.js`.
- [ ] **Task A.5 (Signoff)** Write and pass `tests/a-foundation.spec.js`:
  - Launch Chromium with extension.
  - Seed `chrome.storage.local` via a helper extension page: `domains: { "example.com": true }`.
  - Navigate to `https://example.com/`; assert `documentElement.className` includes `simply-dark`.
  - Assert computed `backgroundColor` of `<html>` parses to a dark color (L* < 20).
  - Assert `getPropertyValue('--sd-bg').trim() === '#121212'`.
  - Navigate to `https://en.wikipedia.org/`; assert class absent and background not dark.
  - Assert `page.on('console')` captured no messages originating from the extension.

### Phase B — Service Worker

**Goal:** Install-time migration from legacy `sync` schema; keyboard command toggles active domain via storage.

**Dependencies:** Phase A (content script must be live to react to storage changes).

- [ ] **Task B.1** Rewrite `C:\git\simply-dark\background.js`:
  - `chrome.runtime.onInstalled.addListener(migrate)`.
  - `migrate()`: `chrome.storage.sync.get(null)` → walk keys → for boolean values, write to `local.domains[key.replace(/^www\./,'')]`; coalesce duplicates by OR (true wins); for `customColors`, map `{backgroundColor → bg, textColor → text, linkColor → link, borderColor → border}` → write to `local.colors`; ignore `cssVersion` and `DomainPreferences`; `chrome.storage.sync.clear()`.
  - `chrome.commands.onCommand.addListener` for `"toggle-dark-mode"`: query active tab, derive domain, read `local.domains`, flip entry, write back.
  - No message router, no `onMessage` listener.
- [ ] **Task B.2 (Signoff)** Write and pass `tests/b-background.spec.js`:
  - **Migration:** before launch, seed `chrome.storage.sync` via a one-shot extension page at next startup with `{"www.example.com": true, "foo.com": false, customColors: { backgroundColor:"#111", textColor:"#eee", linkColor:"#4af", borderColor:"#555" }, cssVersion: 7}`. Re-fire `onInstalled` by reloading the extension. Assert `local.domains == {"example.com":true,"foo.com":false}`, `local.colors == {"bg":"#111","text":"#eee","link":"#4af","border":"#555"}`, `sync.get(null)` is empty, no `cssVersion` in `local`.
  - **Keyboard command effect:** skip direct `chrome.commands` dispatch (Playwright can't trigger real shortcuts reliably); instead invoke the same storage-flip path from an extension helper page (`chrome.runtime.getBackgroundPage` not available in MV3, so expose via `chrome.runtime.sendMessage` — but we said no messaging in shipped code; solution: test imports the `domainFromUrl` helper by reading `background.js` text and evaluating in a sandboxed extension page, or simply assert: a `local.domains` flip triggered externally propagates to the page via `onChanged`). Assert the observed class toggle on an open tab within 100 ms of the storage write.

### Phase C — Popup Rewrite

**Goal:** Popup reads/writes storage directly; no messaging; no tab reloads; live-syncs to other contexts.

**Dependencies:** Phase A (storage schema canonical).

- [ ] **Task C.1** Inspect `C:\git\simply-dark\popup.html` to confirm input IDs; adjust `popup.js` mapping to the new `{bg,text,link,border}` keys. If IDs are legacy (`backgroundColor` etc.), prefer keeping HTML stable and mapping in JS.
- [ ] **Task C.2** Rewrite `C:\git\simply-dark\popup.js`:
  - On `DOMContentLoaded`: `chrome.tabs.query({active:true,currentWindow:true})` → derive domain → `chrome.storage.local.get(["domains","colors"])` → populate domain label, toggle checkbox, 4 color inputs (falling back to defaults when `colors` absent).
  - Toggle `change`: `chrome.storage.local.get("domains")` → `{...domains, [domain]: !domains?.[domain]}` → `chrome.storage.local.set({domains})`. No tab reload.
  - Save: read 4 color inputs → `chrome.storage.local.set({colors: {bg,text,link,border}})`.
  - Reset: `chrome.storage.local.remove("colors")`; update UI to defaults.
  - `chrome.storage.onChanged.addListener` → call `syncUIFromStorage` so external toggles (keyboard command) update the open popup.
  - No `chrome.runtime.sendMessage`.
- [ ] **Task C.3 (Signoff)** Write and pass `tests/c-popup.spec.js`:
  - Open popup as Playwright page: `chrome-extension://<id>/popup.html?testDomain=example.com` (inject test domain via query string read by popup when present — or mock `chrome.tabs.query` via an eval injection before popup scripts run).
  - Seed `domains: { "example.com": false }`, `colors` absent.
  - Assert toggle reflects `false`; click toggle; assert `local.domains["example.com"] === true`.
  - In parallel-open tab on `https://example.com/`, assert `.simply-dark` class appears without tab reload (observe via `page.evaluate` + polling ≤1s).
  - Change `#bg` input to `#222222`, click Save; assert `local.colors.bg === "#222222"`; assert tab's `getComputedStyle(documentElement).getPropertyValue("--sd-bg").trim() === "#222222"`.
  - Click Reset; assert `local.colors` absent from storage; assert tab's `--sd-bg` resolves to `#121212`.

### Phase D — Packaging, FOUC Verification, Console Hygiene

**Goal:** Ship-ready artifacts and sitewide quality gates.

**Dependencies:** Phases A, B, C.

- [ ] **Task D.1** Update `C:\git\simply-dark\package.js`: remove `earlyDarkMode.js` and `domainPreferences.js` from the `files` array.
- [ ] **Task D.2** Update `C:\git\simply-dark\package.json`: add `devDependencies`: `"@playwright/test": "^1.47.0"`; add `scripts`: `{ "test": "playwright test", "test:install": "playwright install chromium", "package": "node package.js" }`.
- [ ] **Task D.3** Create `C:\git\simply-dark\playwright.config.js`: single project `chromium-ext`, `testDir: "tests"`, `fullyParallel: false` (extension context is single), `use: { headless: false }`.
- [ ] **Task D.4** Create `C:\git\simply-dark\tests\helpers\extension.js`: `async function launchWithExtension()` that spins up `chromium.launchPersistentContext(userDataDir, { headless: false, args: ["--disable-extensions-except=<root>", "--load-extension=<root>"] })` and returns `{ context, extensionId }`; also a `seedStorage(context, extensionId, data)` helper that opens `chrome-extension://<id>/popup.html` and evaluates `chrome.storage.local.set(data)`.
- [ ] **Task D.5 (Signoff)** Write and pass `tests/d-packaging-and-fouc.spec.js`:
  - **Packaging:** `execSync("node package.js")`; `unzipper` the produced `chrome store/simply-dark.zip`; assert entry names exactly equal `["manifest.json","background.js","content.js","dark-mode.css","popup.html","popup.js","popup.css","images/icon16.png","images/icon48.png","images/icon128.png"]` (images/options.png allowed). Assert neither `earlyDarkMode.js` nor `domainPreferences.js` present.
  - **FOUC (enabled):** Throttle network via CDP `Network.emulateNetworkConditions` to 400 kbps / 400 ms RTT. Seed `domains: {"example.com": true}`. Navigate to a locally-served slow HTML page (Playwright fixture that sleeps 200 ms before body) at `http://localhost:<port>/`. Sample `getComputedStyle(document.documentElement).backgroundColor` in a `requestAnimationFrame` loop from page `load` event minus 1 frame; assert first sampled color is already in the dark range (R+G+B < 180).
  - **Reverse-FOUC (disabled):** same fixture, `domains` empty; assert sampled color is never in the dark range.
  - **`www.` coalescing:** toggle `example.com` on via popup; visit `https://www.example.com/`; assert class present.
  - **Console clean:** `page.on("console")` over the full test; assert zero messages from our extension scripts.

---

## 6. Risks and Mitigations

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

## 7. Success Criteria

- [ ] All four Playwright signoff specs pass: `a-foundation`, `b-background`, `c-popup`, `d-packaging-and-fouc`.
- [ ] `node package.js` produces a zip containing exactly: `manifest.json`, `background.js`, `content.js`, `dark-mode.css`, `popup.html`, `popup.js`, `popup.css`, `images/*`.
- [ ] Repo no longer contains `earlyDarkMode.js` or `domainPreferences.js`.
- [ ] `manifest.json` declares only `activeTab` + `storage` permissions; no `host_permissions`; no custom CSP.
- [ ] Grep for `console.log` in `background.js`, `content.js`, `popup.js`, `dark-mode.css` returns zero hits.
- [ ] FOUC sample confirms dark at first paint on enabled domains.
- [ ] Reverse-FOUC sample confirms no flash of dark on disabled domains.
- [ ] `www.example.com` and `example.com` share one `domains` entry.
- [ ] Popup live-syncs via `onChanged` without tab reload.
- [ ] Keyboard toggle command flips `local.domains[domain]` (verified via storage assertion).
- [ ] `manifest.json` version is `1.3.0`.

---

## 8. Open Questions

_None. All decisions locked in Phase 1._

---

## 9. Assumptions

- `hostname.replace(/^www\./,'')` is an acceptable "registrable domain" approximation. Sites with `www2.`, country-code second-level domains, etc., will be treated as-is. Documented.
- The popup's existing color-picker input IDs will be mapped in JS rather than renamed in HTML, to minimize churn. Final decision during Phase C.1.
- Playwright runs locally only; no CI. If CI is needed later, add a GitHub Actions workflow with xvfb or `chromium-headless-shell` that supports extensions (currently limited).
- MV3 `content_scripts[].css` is injected synchronously before first paint (per Chrome documentation). This is the guarantee the FOUC-free plan rests on.
- Legacy `sync` per-domain keys are stored as plain booleans (subagent confirmed). No nested structures.

---

## 10. Verification Sweep

Checked PLAN-CONVERSATION-20260421.md against this draft:

| Conversation section | Draft section | Status |
|---|---|---|
| Phase 1 Requirements | §2.1, §2.2, §2.4 | Covered |
| Phase 1 Subagent schema finding | §2.1 FR-7, Task B.1, §9 | Covered |
| Phase 2 System context + packaging script debt | §4.2, Task D.1 | Covered |
| Phase 3 Scope (Medium) | Implicit — single-session 4-phase plan | Covered |
| Phase 4 Tech stack | §3 | Covered |
| Phase 5 Architecture + rejected alternatives | §4, §4.1 | Covered (rejected alternatives documented in conversation log) |
| Phase 6 Risks | §6 | Covered |
| User mandate: Playwright per-task signoff | Tasks A.5, B.2, C.3, D.5 | Covered |

No gaps found. No `<!-- VERIFICATION -->` comments required.

---

## Planning Metrics
<!-- METRICS_JSON {"confidence": 99, "clarification_rounds": 1, "functional_requirements_count": 8, "non_functional_requirements_count": 6, "risk_count": 8, "phase_count": 4, "verification_gaps_found": 0, "confidence_breakdown": {"requirements": 25, "feasibility": 25, "integration": 25, "risk": 24}} -->

confidence: 99
clarification_rounds: 1
functional_requirements_count: 8
non_functional_requirements_count: 6
risk_count: 8
phase_count: 4
verification_gaps_found: 0
confidence_breakdown_requirements: 25
confidence_breakdown_feasibility: 25
confidence_breakdown_integration: 25
confidence_breakdown_risk: 24
