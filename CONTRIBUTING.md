# Contributing

Thanks for helping! The most valuable contributions are fixes when a service changes its endpoint.

## Setup

```
npm install
npm start
```

## Project layout

- `main.js`: Electron main process (window, tray, config, scheduling).
- `providers.js`: one function per service that fetches and normalizes usage. **Most fixes go here.**
- `renderer/`: the UI (cards and settings screen). No framework, plain DOM.
- `preload.js`: the small, explicit bridge between UI and main process.

## Adding a service

1. Add an async function in `providers.js` that returns `{ windows: [{ label, percent, resetsAt, detail? }], plan?, note? }`, or `{ action: 'login' | 'key', error? }`, or `{ error }`.
2. Register it in the `PROVIDERS` array and add its name in `renderer/renderer.js`.

## Ground rules

- Never commit or paste real API keys, cookies, tokens, or account data (including in screenshots and issues).
- Keep the app local-only: no telemetry, no third-party servers.
- Keep dependencies minimal.
