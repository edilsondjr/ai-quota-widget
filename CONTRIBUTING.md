# Contributing

Thanks for helping! The most valuable contributions are fixes when a service changes its endpoint.

## Setup

```bash
npm install
npm start
```

## Project layout

- `main.js`: Electron main process (window, tray, config, scheduling).
- `providers/`: one file per service (`claude.js`, `chatgpt.js`, ...) that fetches and normalizes usage, plus `index.js` (the registry) and `settings.js` (generic settings validation and metadata). **Most fixes go here.**
- `renderer/`: the UI (cards and settings screen). No framework, plain DOM.
- `preload.js`: the small, explicit bridge between UI and main process.
- `locales/`: UI text, one JSON file per language (`en-US.json` is the default and the fallback).

## Translating

Copy `locales/en-US.json` to `locales/<code>.json` (e.g. `fr.json`), set `_name` to the language's own name, and translate the values. Keys you leave out fall back to English. The new language appears in Settings automatically.

## Adding a service

1. Create `providers/<id>.js` exporting `{ id, name, loginUrl, settings, run(cfg) }`. `run` returns `{ windows: [{ key, percent, resetsAt, detail? }], plan?, note? }`, or `{ action: 'login' | 'key', error? }`, or `{ error }`. Keep the response parsing in a separate pure function (no Electron) so it can be tested. Providers never return UI text: windows carry a stable `key` (translated as `win.<key>` in `locales/`), and errors/notes are codes (`err.<code>`, `note.<code>`) with optional `errorParams` / `noteParams`.
   - `settings` declares the fields the service needs, for example `[{ key: 'openrouterApiKey', type: 'secret' }]`. Types are `secret`, `string`, `number` (optional `min`, `max`, `default`) and `boolean`. Secret fields are encrypted at rest and only an "is set" flag reaches the UI. Add the label and optional hint/placeholder to `locales/` as `p.<id>.<key>`, `p.<id>.<key>.hint` and `p.<id>.<key>.ph`.
   - `loginUrl` is only for browser sign-in providers (currently Claude and ChatGPT). Key-based providers set it to `null` and declare their secret fields instead.
   - A service that only exposes a balance (no percentage) returns `windows: []` plus a note.
2. Register it in the `PROVIDERS` array in `providers/index.js`. Cards, the settings list and the detail view pick up its name and fields from the declaration, so no UI change is needed.

## Tests

```bash
npm test        # parsers, settings, locales and pure UI helpers
npm run test:e2e  # Electron UI smoke test (Windows; uses a local fake provider)
```

Uses Node's built-in test runner for the unit tests. The Electron UI test uses `playwright-core` to launch the source app with a temporary data directory under `QUOTAWIDGET_HOME`, so it never reads or writes real credentials. It covers the settings screen, custom-provider Cancel/Test/Save/Delete, the guided form and the always-on-top toggle. Parser tests read fixtures from `test/fixtures/`. When an endpoint changes, add or update a fixture with an **anonymized** real response (no names, emails, ids, keys or tokens), then fix the parser until the test passes. A locale test also checks that every language has the same keys as `en-US.json`.

## Ground rules

- Never commit or paste real API keys, cookies, tokens, or account data (including in screenshots and issues).
- Keep the app local-only: no telemetry, no third-party servers.
- Keep dependencies minimal.
