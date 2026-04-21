# Changelog

All notable changes to Simply Dark are documented in this file.

## [1.3.1] - 2026-04-21

### Added

- Live color preview in the popup. Dragging any of the four color pickers updates the active page immediately via an ephemeral `previewColors` storage key. **Save** commits to `colors`; closing the popup or clicking **Reset** discards the preview.

### Fixed

- Sidebar text rendering invisibly on sites with fixed-position nav panels (reproduced on Mintlify-hosted docs such as `hyperframes.heygen.com`). The universal `background-color: var(--sd-bg) !important` override was triggering a paint/compositing interaction that suppressed text drawing despite correct computed colors. Descendants now use `background-color: transparent !important` so the root dark background shows through.

### Changed

- Expanded `dark-mode.css` to handle common edge cases: strips `background-image` from non-media elements (kills light gradients), preserves gradient-text elements (`background-clip: text`), lets anchor descendants inherit link color, adds `color-scheme: dark`, styles form placeholders and WebKit autofill/scrollbars, and keeps SVG internals out of the universal recolor so inline icons stay intact.

## [1.3.0] - 2026-04-21

### Changed

- Refactored the extension into a minimal, FOUC-free architecture. A single class-gated stylesheet (`dark-mode.css`) is now injected at `document_start` via the manifest, eliminating flashes of light content on enabled domains and flashes of dark on disabled domains.
- Rewrote `content.js` (~40 lines) to toggle `html.simply-dark` and four CSS variables (`--sd-bg`, `--sd-text`, `--sd-link`, `--sd-border`) directly from `chrome.storage.local`.
- Rewrote `background.js` (~25 lines) with an `onInstalled` migration from the legacy `chrome.storage.sync` schema and an `onCommand` keyboard toggle.
- Rewrote `popup.js` (~60 lines) to read and write `chrome.storage.local` directly and live-sync with other contexts via `storage.onChanged` — no tab reloads.
- Consolidated storage to `chrome.storage.local` only, with a single canonical domain form (`hostname` with `www.` stripped). `www.example.com` and `example.com` now share one entry.
- Slimmed `manifest.json` permissions to `activeTab` and `storage`; removed `host_permissions`, `tabs`, and the custom `content_security_policy`.

### Added

- Playwright signoff test suite covering foundation, service worker, popup live-sync, and packaging/FOUC (`tests/a-foundation.spec.js`, `b-background.spec.js`, `c-popup.spec.js`, `d-packaging-and-fouc.spec.js`) with an extension launcher helper (`tests/helpers/extension.js`).
- npm scripts: `test`, `test:install`, `package`.

### Removed

- `earlyDarkMode.js` and `domainPreferences.js` (dead code replaced by the manifest-declared stylesheet and direct storage access).
- Runtime messaging between popup, content script, and service worker (replaced by `storage.onChanged`).
