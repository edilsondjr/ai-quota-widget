# Contributing

Thanks for helping! The most valuable contributions are fixes when a service changes its endpoint.

## Setup

```
npm install
npm start
```

## Project layout

- `main.js`: Electron main process (window, tray, config, scheduling).
- `providers/`: one file per service (`claude.js`, `chatgpt.js`, ...) that fetches and normalizes usage, plus `index.js` (the registry). **Most fixes go here.**
- `renderer/`: the UI (cards and settings screen). No framework, plain DOM.
- `preload.js`: the small, explicit bridge between UI and main process.

## Adding a service

1. Create `providers/<id>.js` exporting `{ id, name, loginUrl, run(cfg) }`. `run` returns `{ windows: [{ label, percent, resetsAt, detail? }], plan?, note? }`, or `{ action: 'login' | 'key', error? }`, or `{ error }`. Keep the response parsing in a separate pure function (no Electron) so it can be tested.
2. Register it in the `PROVIDERS` array in `providers/index.js` and add its name in `renderer/renderer.js`.

## Ground rules

- Never commit or paste real API keys, cookies, tokens, or account data (including in screenshots and issues).
- Keep the app local-only: no telemetry, no third-party servers.
- Keep dependencies minimal.
