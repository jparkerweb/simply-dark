# Planning Conversation — Simply Dark Refactor

**Created:** 2026-04-21
**Feature:** dark-mode-refactor
**Companion:** `PLAN-DRAFT-20260421.md`

---

## Source

User invoked `/smarsh2code-1-plan @PLAN.md`. Planning proceeded without `AGENTS.md` (user opted to skip init). The repo-root `PLAN.md` was treated as canonical input alongside direct inspection of `C:\git\simply-dark\`.

---

## Phase 1 — Requirements Analysis

### Clarifying Questions & Answers

| # | Question | Answer |
|---|---|---|
| 1 | Additional files to examine beyond extension root? | No. `PLAN.md` + repo is it. |
| 2 | Is the legacy `sync` schema fully captured? | "Check the codebase" — spawned Explore subagent. |
| 3 | `www.` coalescing strategy? | Assistant decides → naïve `replace(/^www\./,'')`. |
| 4 | Testing approach? | Assistant decides → **Playwright-CLI E2E signoff per task** (user-mandated). |

### Subagent Finding — Legacy Storage Schema

| Legacy key | Shape | Status | Migration |
|---|---|---|---|
| `[hostname]` (per-domain) | `boolean` | Active in `sync` | → `local.domains[stripWww(hostname)]` |
| `customColors` | `{backgroundColor, textColor, linkColor, borderColor}` hex strings | Active in `sync` | → `local.colors` with renamed keys `{bg, text, link, border}` |
| `cssVersion` | `number` | Orphaned (read, never written) | Discard |
| `DomainPreferences` | runtime object (never actually persisted) | Dead code | Discard |

### Locked Requirements

**Functional:** FR-1 per-domain toggle persisted to `local.domains`. FR-2 zero FOUC and zero reverse-FOUC. FR-3 keyboard command `toggle-dark-mode`. FR-4 popup: domain label, switch, 4 color pickers, Save, Reset. FR-5 state flow via `storage.onChanged` only (no messaging, no reloads). FR-6 `www.` coalescing. FR-7 one-time migration on `onInstalled`. FR-8 color customization via CSS vars on `<html>`.

**Non-Functional:** NFR-1 single content script at `document_start` with static CSS declared in manifest. NFR-2 no MutationObserver / forced reflow / DOM iteration / JS-injected `<style>`. NFR-3 permissions: `activeTab` + `storage` only. NFR-4 no `console.log` in shipped code. NFR-5 manifest version `1.3.0`. NFR-6 single stylesheet gated on `html.simply-dark`.

**Testing:** Playwright `@playwright/test` spec per implementation task as signoff gate; no unit tests.

**Sign-off:** User replied `approved`.

---

## Phase 2 — System Context

- Brownfield MV3 extension, flat repo, vanilla JS/CSS/HTML, no build step, no tests.
- Packaging script `package.js` (archiver) references files to be deleted — must be pruned.
- Existing conventions: callback-style `chrome.*` APIs, 2-space indent, no modules.
- Sole external surface: Chrome Extension APIs. No network, no auth, no third parties.
- Tech debt to unwind: `domainPreferences.js` dead, inline duplicate in `content.js`, unused `cssVersion`, redundant message router, tab-reload pattern, forced reflow, MutationObserver, `document.getElementsByTagName('*')`, fragile `[style*=...]` selectors, duplicated JS-injected `<style>`.

---

## Phase 3 — Scope Assessment

| Indicator | Count | Bucket |
|---|---|---|
| Phases | 4 | Medium |
| Requirements | 14 | Medium (upper edge) |
| Components | 5 + tooling | Medium |
| Integrations | 1 (Chrome APIs) | Small |

**Assessment: Medium.** Standard workflow, single-session plan.

---

## Phase 4 — Tech Stack

### Decisions

| Category | Choice | Rationale |
|---|---|---|
| Runtime | Chrome MV3 | Only option for new/updated extensions. |
| Language | Vanilla JS (ES2022) | ~250-line codebase; TS toolchain violates simplicity mandate. |
| CSS | Plain CSS + custom properties | Single gated stylesheet. |
| Storage | `chrome.storage.local` only | Fast, no quota, no sync-races. |
| Test runner | `@playwright/test ^1.47.0` | First-class extension loading; user mandate. |
| Packaging | Keep `archiver` + `package.js` | Works; file list only needs pruning. |
| Lint/CI | None | Out of scope. |

### Devil's Advocate

Considered TypeScript + esbuild + web-ext. Rejected — doubles file count, adds build step user didn't ask for, fights "simple & elegant."

---

## Phase 5 — Architecture

### Pattern

**Class-gated static CSS + onChanged bus.** One stylesheet under `html.simply-dark` loaded at `document_start`. Content script toggles class + 4 CSS vars. All contexts coordinate via `chrome.storage.onChanged`.

### Rejected Alternatives

- **Dynamic `insertCSS` from SW:** SW wakeup latency + fragile `removeCSS` + FOUC risk.
- **`prefers-color-scheme` via DevTools protocol:** requires `debugger` permission (scary prompt), can't customize sites without native dark mode.
- **CSS filter invert (Dark Reader style):** would make the 4 color pickers meaningless, breaks SVGs and native-dark sites.

### Components

| Component | Responsibility |
|---|---|
| `manifest.json` | Single content script @ document_start; commands; minimal perms. |
| `dark-mode.css` | All visual rules under `html.simply-dark` with `--sd-*` vars + defaults. |
| `content.js` | Read `local.{domains,colors}`, apply; subscribe to `onChanged`. |
| `background.js` | `onInstalled` migration; `onCommand` toggle. |
| `popup.{html,js,css}` | Render + mutate storage; live-sync via `onChanged`. |
| `tests/` | One Playwright spec per implementation task. |

### Storage Schema

```json
{
  "domains": { "example.com": true },
  "colors":  { "bg": "#121212", "text": "#e4e4e4", "link": "#3391ff", "border": "#555555" }
}
```

---

## Phase 6 — Technical Spec

4 implementation phases A→B→C→D, each with a Playwright signoff test. See `PLAN-DRAFT-20260421.md` §5 for the full task breakdown.

### Top Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content-script async `local.get` race at `document_start` | Med | Low | CSS file injected pre-paint is enough; class flip near-instantaneous. Test confirms. |
| `!important` breaks syntax-highlighter sites | Med | Med | Exclude `pre, code, a, img, video, canvas, picture` via `:not(...)`. |
| Playwright can't trigger real `chrome.commands` | Med | Low | Test the storage-write side effect directly; shortcut dispatch verified manually per README. |
| Popup HTML IDs don't match new color key names | Low | Med | Read `popup.html` during Phase C; adjust JS mapping. Test catches miswiring. |

---

## Phase 7 — Outputs

- This conversation log.
- `PLAN-DRAFT-20260421.md` — actionable plan with phased tasks, tests, success criteria, verification, metrics.
- Verification sweep against PLAN-DRAFT (see §9 of draft).

**Final confidence: 99%** (Requirements 25 · Feasibility 25 · Integration 25 · Risk 24).
