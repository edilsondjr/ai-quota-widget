# Quota Widget

A small always-on-top Windows widget that shows your AI usage quotas across providers in one place. One bar per usage window, with a countdown to the next reset.

Currently supported: **Claude**, **ChatGPT (Codex)**, **Command Code** and **Ollama**. Adding a provider is a single file, see [CONTRIBUTING.md](CONTRIBUTING.md).

> Português: veja a seção [Leia-me (pt-BR)](#leia-me-pt-br) no final.

## Features

- One card per service, with colored bars (green, amber, red) and "resets in…" countdowns.
- Settings screen: choose which services and which windows are shown, set the refresh interval, enter API keys, pick the language (English or Português), and toggle always-on-top and start with Windows.
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

[MIT](LICENSE)

---

## Leia-me (pt-BR)

Widget flutuante para Windows que reúne as quotas de uso das suas IAs em um só lugar, com barras e contagem regressiva até a renovação. Hoje suporta **Claude**, **ChatGPT (Codex)**, **Command Code** e **Ollama**, e novos provedores são bem-vindos.

- **Instalar:** baixe o `Quota-Widget-Setup-<versão>.exe` na página de [Releases](../../releases). O instalador não é assinado, então o SmartScreen pode avisar; clique em "Mais informações" e "Executar assim mesmo".
- **Configurar:** clique no ⚙ do widget para escolher o que aparece, o intervalo de atualização, as chaves de API (guardadas criptografadas pelo Windows), o idioma (English/Português) e o início com o Windows.
- **Gerar do código:** `npm install` e `npm run dist` (Node 20+, no Windows).
- **Aviso:** as rotas usadas não são oficiais e podem mudar. Use apenas com as suas próprias contas e por sua conta e risco.
