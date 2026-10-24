# Contributing

Thanks for helping! The most valuable contributions are fixes when a service changes its endpoint.

## Setup

```bash
npm install
npm start
```bash

## Project layout

- `main.js`: Electron main process (window, tray, config, scheduling).
- `providers/`: one file per service (`claude.js`, `chatgpt.js`, ...) that fetches and normalizes usage, plus `index.js` (the registry). **Most fixes go here.**
- `renderer/`: the UI (cards and settings screen). No framework, plain DOM.
- `preload.js`: the small, explicit bridge between UI and main process.

- `locales/`: UI text, one JSON file per language (`en.json` is the default and the fallback).

## Translating

Copy `locales/en.json` to `locales/<code>.json` (e.g. `es.json`), set `_name` to the language's own name, and translate the values. Keys you leave out fall back to English. The new language appears in Settings automatically.

## Adding a service

1. Create `providers/<id>.js` exporting `{ id, name, loginUrl, run(cfg) }`. `run` returns `{ windows: [{ label, percent, resetsAt, detail? }], plan?, note? }`, or `{ action: 'login' | 'key', error? }`, or `{ error }`. Keep the response parsing in a separate pure function (no Electron) so it can be tested. Providers never return UI text: windows carry a stable `key` (translated as `win.<key>` in `locales/`), and errors/notes are codes (`err.<code>`, `note.<code>`) with optional `errorParams` / `noteParams`.
2. Register it in the `PROVIDERS` array in `providers/index.js` and add its name in `renderer/renderer.js`.

## Tests

```bash
npm test
```bash

Uses Node's built-in test runner (no extra dependencies) and runs on every push and pull request. Parser tests read fixtures from `test/fixtures/`. When an endpoint changes, add or update a fixture with an **anonymized** real response (no names, emails, ids, keys or tokens), then fix the parser until the test passes. A locale test also checks that every language has the same keys as `en.json`.

## Ground rules

- Never commit or paste real API keys, cookies, tokens, or account data (including in screenshots and issues).
- Keep the app local-only: no telemetry, no third-party servers.
- Keep dependencies minimal.
