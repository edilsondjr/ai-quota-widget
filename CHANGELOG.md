# Changelog

All notable changes to Quota Widget. Versions follow SemVer.

## 0.15.1 - 2026-10-29

### Changed

- Smaller Windows installer: maximum solid compression, Electron language resources limited to the six supported UI languages, and differential packages disabled because the update check opens the full installer download.

## 0.15.0 - 2026-10-26

### Added

- First-run empty state with a direct provider-setup action.
- Comfortable and Compact density modes.
- Service order setting (default, custom or most urgent first), favorites, and drag-and-drop reordering per provider.
- Search in the service list and a Settings shortcut on each provider card.
- Per-provider notification thresholds, plus snooze from Settings and the tray.
- Keyboard shortcuts for refresh, Settings, pin and closing Settings.
- Provider errors now offer a direct shortcut to that provider's Settings.

### Changed

- Settings groups configured services above available integrations; only configured, enabled services appear in the widget.
- Adding credentials activates the service; browser sign-in is available in Settings, and disabled browser services retain their setup status.
- Icon buttons have accessible labels and keyboard shortcuts, and form controls have a visible focus ring.
- Cards honor reduced-motion and high-contrast preferences.

## 0.14.1

### Security

- Updated Electron to 45, electron-builder to 26.18 and the build requirement to Node 22.12+; `npm audit` is clean.
- Hardened provider login/browser windows: permissions denied by default, non-HTTPS navigation blocked, popups limited, and the main window cannot navigate or open new windows.
- Config import now rejects every known plaintext secret field, not only keys ending in `apiKey`, and custom-provider headers reject CR/LF injection.
- Added stricter CSP directives and explicit `nodeIntegration: false`/`webviewTag: false` on provider windows.

## 0.14.0

### Added

- Manual **Check for updates** in Settings. It queries GitHub Releases and opens the release page; it never downloads or installs automatically.
- `SHA256SUMS.txt` on every release.
- Bug report and provider request issue templates.

### Changed

- The privacy policy documents the optional GitHub release check.

## 0.13.0

### Added

- UI translations for Simplified Chinese (`zh-CN`), Japanese (`ja-JP`) and German (`de-DE`), available in Settings.
- `PRIVACY.md` documenting local storage, encrypted API keys, network behavior and the absence of telemetry.

### Changed

- README lists the available UI languages and links to the privacy policy.

## 0.12.3

### Changed

- More breathing room in the top dock: 128px tall, 208px chips, a 76px name/plan column and usage windows in a single readable column. The typical five providers still fit.

## 0.12.2

### Changed

- The top dock now shows every usage window for each provider in a compact two-column grid, with the provider name/plan at the left and the note below. Chips are 210px wide, so the typical five providers fit in the strip.

## 0.12.1

### Fixed

- The top dock hid every usage window because the `:first-of-type` selector matched the provider header instead of the first window. The first consumption window is visible again; extra windows remain compacted.

## 0.12.0

### Added

- **Layout** setting: floating Card or Dock.
- Dock positions **Top**, **Left** and **Right**, with adaptive window size and screen-edge placement.
- A horizontal top strip with compact provider chips, a full-height side rail, and a 360px Settings panel while editing.
- The dock choice persists in `config.json`; Classic and Paper skins apply to it.

### Changed

- The window can resize beyond the old fixed 336px card width when docked.

## 0.11.0

### Added

- Appearance section with built-in **Classic** and **Paper** skins. Paper uses a light paper background, serif headings and square rules.
- Skin gallery with previews, live preview, Cancel revert and persistence in `config.json`.
- A **Skin** submenu in the tray for quick switching.

### Changed

- Classic remains the default skin.

## 0.10.2

### Fixed

- Changing the custom-provider Template dropdown no longer resets the form. Use the explicit **Apply template** button (with confirmation) to replace only the mapping (windows, note values and plan); name, URL, auth, headers, body and the API key stay unchanged.

## 0.10.1

### Fixed

- Custom provider note templates can span multiple lines. The guided Note template is now a textarea and the card preserves line breaks; `\n` also works in JSON.

## 0.10.0

### Added

- Custom provider mappings can use safe expressions starting with `=` (paths, arithmetic, `Math.*`, `Number`/`String`/`Boolean`/`parseInt`/`parseFloat`/`isFinite`, `toFixed`/`toLocaleString`, comparisons and ternaries). Expressions never use `eval`/`Function` and cannot reach Node APIs.
- The custom provider editor has a **?** help panel with the supported paths, functions, methods, operators and examples.
- Expression failures are shown as `Expression failed: …` in Test and on the card.

### Changed

- Mapping fields accept either dot/bracket paths or a safe `=expression`; the guided form accepts expressions too.

## 0.9.0

### Added

- The custom provider guided editor supports multiple usage windows and note values, with Add/Remove rows.
- Configuration backup, export, import and reset in Settings. Import and reset create a backup first and restart the app.
- Windows notifications when a window reaches 90% or a quota renews, with a mute switch in Settings and the tray menu.
- Per-provider diagnostics: last success, latency, failures, next retry and last error, with a **Copy diagnostic** action that never includes secrets.
- Per-provider refresh intervals, jitter and exponential backoff for failing providers.

### Changed

- Custom provider specs, including headers and body, are encrypted at rest. The plaintext `customProviders` field is migrated to an encrypted `customProvidersEnc` blob (config version 2).
- The app backs up `config.json` before a config-version migration.

## 0.8.0

### Added

- Custom provider guided form covering name, URL, method, auth, headers/body, one usage window, a note and a plan, with a JSON toggle for complex specs.
- Custom provider templates (usage, balance, monthly cost) and Copy JSON / Load JSON actions. Copied specs never include the API key.
- Electron UI smoke test (`npm run test:e2e`) for settings, custom provider Cancel/Test/Save/Delete, the guided form and the always-on-top toggle. It runs with a temporary data directory and a local fake provider.

### Changed

- New custom providers open in Guided mode. Specs with multiple windows or note values open in JSON mode and show a hint.

## 0.7.3

### Fixed

- Command Code now shows the monthly window. `/alpha/billing/credits` only returns the 5-hour and weekly windows; the monthly pool is computed from `credits.monthlyCredits + purchasedCredits + freeCredits`, the billing-period spend from `/alpha/usage/summary?since=currentPeriodStart`, and `data.currentPeriodEnd` from `/alpha/billing/subscriptions`.

## 0.7.2

### Added

- Custom provider editor: **Test** fetches the current spec/key and previews the parsed windows, note and plan without saving the provider.
- Config files carry a `configVersion` and are written atomically (temp file + rename), so a crash cannot leave a half-written `config.json`.
- Refresh runs at most four providers at a time and keeps the last successful reading when an update fails.
- Cards show a stale notice when they display the last successful reading after a failed update.

### Changed

- The custom provider form uses a short "Delete" action so Save/Test/Cancel/Delete fit on one row.

## 0.7.1

### Fixed

- Custom provider form: Cancel, back and save now navigate correctly. The form parameter no longer shadows the settings view state.

## 0.7.0

### Added

- User-defined custom providers from a JSON spec (URL, method, auth, headers, body, response mapping) with the API key stored encrypted.
- Custom provider edit/delete from the service detail.

### Changed

- App data moved to `~/.quotawidget/` (`config.json` plus provider profiles in `profiles/`); the legacy Electron userData folder is migrated once and its plaintext keys are removed.
- The always-on-top button uses an SVG and visibly reflects its on/off state.
- Command Code shows the monthly window (`windowLimits.monthly`, with `month` as an alias).

## 0.6.0

### Added

- Synthetic, NanoGPT, OpenAI API, Anthropic API, xAI (Grok), Mistral and OpenCode Go providers.
- Cost-only cards (monthly spend/balance) for OpenAI API, Anthropic API, xAI and Mistral.

### Changed

- Anthropic cost-report amounts are converted from cents to dollars.
- Mistral uses its billing usage/subscription endpoints; OpenCode uses the Go usage endpoint.

## 0.5.0

### Added

- Settings rework: one row per service with a detail view for usage windows and provider fields.
- OpenRouter, DeepSeek, Moonshot (Kimi) and GitHub Copilot providers.
- Generic provider settings declarations; API keys are encrypted and never written in plain text.

### Changed

- Browser sign-in is limited to Claude and ChatGPT; Ollama and Command Code are API-key-only.

## 0.4.0

- Initial public release with Claude, ChatGPT (Codex), Command Code and Ollama.
