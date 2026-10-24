# Changelog

All notable changes to Quota Widget. Versions follow SemVer.

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
