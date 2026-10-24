# Quota Widget

A small always-on-top Windows widget that shows your AI usage quotas across providers in one place. One bar per usage window, with a countdown to the next reset.

Currently supported: **Claude**, **ChatGPT (Codex)**, **Command Code** and **Ollama**. Adding a provider is a single file, see [CONTRIBUTING.md](CONTRIBUTING.md).

> Also available in: [Português (pt-BR)](docs/README.pt-BR.md) · [Español](docs/README.es.md)

<p align="center"><img src="docs/screenshot.png" alt="Quota Widget showing Claude, ChatGPT, Command Code and Ollama usage bars" width="382"></p>

## Features

- One card per service, with colored bars (green, amber, red) and "resets in…" countdowns.
- Settings screen: choose which services and which windows are shown, set the refresh interval, enter API keys, pick the language (English, Português or Español), and toggle always-on-top and start with Windows.
- System tray icon; the window remembers its position.
- Everything runs locally. Logins live in isolated Electron sessions on your machine, and API keys are stored encrypted with Windows (Electron `safeStorage`, tied to your Windows user) in a local `config.json`. Nothing is sent anywhere except to the services themselves.

## Install

Download `Quota-Widget-Setup-<version>.exe` from the [Releases](../../releases) page and run it. No admin rights needed.

The installer is **not code-signed**, so Windows SmartScreen may warn on first run: click *More info*, then *Run anyway*.

## Build from source

Requires Node.js 20+ on Windows.

```
npm install
npm start          # run in development
npm run dist       # build the installer into dist/
```

## Where the data comes from

None of these services offers an official quota API for subscriptions, so the widget reads the same endpoints their own sites and CLIs use. **They are undocumented and can change or break at any time.**

| Service | Source | Auth |
|---|---|---|
| Claude | `claude.ai/api/organizations/<org>/usage` | Sign in once via the **Sign in** button |
| ChatGPT | `chatgpt.com/backend-api/wham/usage` (same route the Codex CLI uses) | Sign in via the button |
| Ollama | `ollama.com/api/usage` (API key, monthly USD credit) or the settings page | API key in Settings, or sign in |
| Command Code | `api.commandcode.ai/alpha/billing/credits` | Reads `~/.commandcode/auth.json` (run `cmd login`) or an API key in Settings |

Each provider lives in its own file under [`providers/`](providers), so a broken endpoint is a one-file fix.

Notes:

- Google/Apple sign-in inside an embedded window is often refused by the provider. Use email code/link sign-in instead.
- Ollama's newer plans meter a monthly USD credit (Pro $60, Max $300), not session/weekly limits. Set the renewal day in Settings if the estimate is off.
- Unknown internal limits returned by Claude are hidden by default; you can show them in Settings.

## Privacy and responsibility

The widget only talks to the four services above, using your own account. It does not collect telemetry. Accessing undocumented endpoints may be against a provider's terms of service; use it at your own risk and only with your own accounts.

This project is independent and not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, Ollama or Command Code. All product names are trademarks of their owners.

## Contributing

Issues and pull requests are welcome, especially fixes when an endpoint changes. See [CONTRIBUTING.md](CONTRIBUTING.md). Never paste real API keys, cookies or tokens into issues.

## License

[MIT](LICENSE). Made by [BeamGlyph](https://www.beamglyph.com).
