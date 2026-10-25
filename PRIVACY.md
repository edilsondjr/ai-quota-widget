# Privacy policy

Effective date: 2026-10-25

Quota Widget is a local Windows desktop app published by BeamGlyph. This policy
explains what the app stores and where it connects. It applies to the installer
and the app.

## Summary

- No telemetry, analytics, advertising, crash reporting or BeamGlyph account.
- No BeamGlyph backend. The app does not send your data to us.
- API keys and custom-provider specs are encrypted at rest with Windows DPAPI
  through Electron `safeStorage`, tied to your Windows user.
- The app connects only to the provider endpoints you enable or configure,
  using your own account or session.
- You can remove providers, reset local data and uninstall at any time.

## Data stored on your computer

Under `%USERPROFILE%\.quotawidget\` (or the path shown by the app), the app
stores:

- `config.json`: settings, provider configuration, encrypted API keys and
  encrypted custom-provider specs.
- `profiles/`: isolated Electron sessions for browser-based sign-ins such as
  Claude and ChatGPT. These contain cookies and local storage for your own
  accounts.
- Local readings and diagnostics used to draw the widget and troubleshoot
  updates, such as the last reading, timestamps, latency and error messages.
- Backups and exports created by the app. These contain encrypted configuration;
  store them somewhere safe.

If `safeStorage` is unavailable, secrets are not written to disk. The app does
not write API keys in plain text.

## Network connections

The app makes requests only to the services you enable:

- API endpoints for the providers listed in the README: Claude, ChatGPT
  (Codex), Command Code, Ollama, OpenRouter, DeepSeek, Moonshot, GitHub
  Copilot, Synthetic, NanoGPT, OpenAI API, Anthropic API, xAI and Mistral, plus
  OpenCode Go.
- The exact URL you configure for a custom provider.
- Any local endpoint you configure for a custom provider.

Requests carry your API key, browser session or other credentials as required
by that provider. They go directly to the provider; BeamGlyph does not proxy or
receive them. The app does not send telemetry, analytics, crash reports or usage
data to BeamGlyph or any other server.

Third-party providers process requests under their own terms and privacy
policies. Some providers do not publicly document the quota endpoints used
here; review the provider's terms before enabling it. The app uses only the
account or session you configure and does not bypass authentication or access
other users' data.

## What we do not collect

We do not collect names, email addresses, IP addresses, device identifiers,
usage analytics or crash data. We do not sell data. There is no BeamGlyph
account for the app.

## Your controls

- Disable or remove a provider in Settings.
- Reset settings. The app creates a backup first, then removes keys and custom
  providers.
- Export or import configuration. Exports contain encrypted configuration.
- Uninstall through Windows Settings → Apps. Remove
  `%USERPROFILE%\.quotawidget\` to delete all local data.
- Delete browser sign-in profiles in the app's profile folder.

## Security

Report a vulnerability to <edilsondjr@gmail.com>. Do not open a public issue
with API keys, cookies or tokens. We will investigate and credit reporters if
desired. No bug bounty is offered.

## Changes

We will update this policy in the repository and mention material changes in
release notes. The effective date above is the latest revision.

## Contact

Edilson Domingues Junior / BeamGlyph
<https://github.com/edilsondjr/ai-quota-widget>
<edilsondjr@gmail.com>
