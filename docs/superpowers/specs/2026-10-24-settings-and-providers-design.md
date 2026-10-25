# Settings rework and four new providers

## Intent

The widget has four providers and a single long settings form. Adding more providers would make that form (in a 336 px wide window) unusable. This change (1) reworks Settings so each provider owns its own section, driven by a declaration inside the provider file, and (2) adds the best-known providers that have a **documented** usage or balance API.

A later step (out of scope here) lets users add providers without code. Declaring settings per provider is the groundwork for it.

## Goals

- Settings = a short main screen (language, interval, always on top, start with Windows) plus one row per service. A row has an on/off switch and opens a detail view for that service.
- A provider declares its own settings fields (key, type, label). The main process validates and stores them generically, and the UI renders them generically. Adding a provider no longer means editing the settings UI.
- Add four providers, built only from official documentation: OpenRouter, DeepSeek, Moonshot (Kimi), GitHub Copilot.
- Everything stays translated (en-US, es, pt-BR) and covered by tests with synthetic fixtures.

## Non-goals

- User-defined providers (next project).
- Cursor and other services without published API documentation. Their routes are undocumented, and the response shape could not be verified.
- Scraping HTML pages for the new providers.
- Changing how existing providers fetch data.

## Anti-goals

- Settings that lose a user's existing values on upgrade. Existing config keys keep their names and meaning.
- Secrets leaking to the UI. Only "is set" flags cross to the renderer.

## Settings UX

Main screen:

```
< Settings
 Language        [English (US) v]
 Refresh (min)   [5]
 [x] Always on top   [x] Start with Windows

 Services
 (o) Claude          signed in      >
 (o) ChatGPT         signed in      >
 (o) Command Code    key set        >
 (o) Ollama          key set        >
 (o) OpenRouter      needs key      >
 ( ) DeepSeek        needs key      >
 ...
 [Save] [Cancel]            Open config.json
```

Detail view (one service): which usage windows to show (checkboxes, as today), then that provider's declared fields, then "remove key" for secrets. A back arrow returns to the main screen without losing unsaved edits. One Save applies everything, as today.

Status text per row: "signed in / sign in needed" for login providers, "key set / needs key" for key providers.

## Provider declaration

Each provider file exports an extra `settings` array:

```js
settings: [
  { key: 'openrouterApiKey', type: 'secret' },
  { key: 'ollamaBillingDay', type: 'number', min: 1, max: 31 },
  { key: 'claudeShowUnknown', type: 'boolean' },
]
```

Types: `secret`, `string`, `number`, `boolean`. Text comes from locales as `p.<providerId>.<key>` (label), `p.<providerId>.<key>.hint` and `p.<providerId>.<key>.ph` (optional). The main process sends the UI a list `{ id, name, canLogin, fields }` plus current non-secret values and an "is set" flag per secret. `set-config` accepts only declared keys and validates by type.

Secret fields are encrypted at rest through the existing `safeStorage` code; the list of secret keys is derived from the declarations instead of the hard-coded `SECRET_KEYS`.

Existing config keys are unchanged (`ollamaApiKey`, `ollamaBillingDay`, `ollamaMonthlyCredits`, `commandcodeApiKey`, `claudeShowUnknown`), so no config migration is needed.

## New providers

All use `Authorization: Bearer <key>` unless noted. Percentages are computed by the widget.

| Provider | Request | Shown | Notes |
|---|---|---|---|
| OpenRouter | `GET https://openrouter.ai/api/v1/key` | Window `key_limit` (used / limit) when the key has a credit limit, resetting per `limit_reset` (daily, weekly, monthly in UTC). Window `free_requests` (`free_model_daily_requests` used / limit), resets at next UTC midnight. | Key with no limit: note "spent this month". |
| DeepSeek | `GET https://api.deepseek.com/user/balance` | Balance note, one per currency (CNY / USD). Error if `is_available` is false. | No quota percent exists. |
| Moonshot (Kimi) | `GET https://api.moonshot.ai/v1/users/me/balance` | Balance note in USD (available, with cash/voucher detail). | International platform only (kimi.ai keys). |
| GitHub Copilot | `GET https://api.github.com/users/{username}/settings/billing/premium_request/usage` (headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`) | Window `premium_requests`: sum of `grossQuantity` over `usageItems` where `sku` is `premium_request`, divided by the monthly allowance, resetting on the 1st (UTC). | Needs GitHub username, a token, and the monthly allowance, because the documented response reports usage, not the plan's allowance. Org- or enterprise-managed licenses are not covered by this endpoint. |

Settings per provider: OpenRouter `openrouterApiKey`; DeepSeek `deepseekApiKey`; Moonshot `moonshotApiKey`; Copilot `githubToken` (secret), `githubUsername` (string), `copilotMonthlyRequests` (number, default 300).

Balance-only providers return `windows: []` plus a note, so the card shows a balance line and no bars. Notes use codes (`note.balance`, `note.spent_month`, ...) with parameters, as today.

## Constraints

- Providers return no UI text: window keys and note/error codes only (existing convention).
- Parsers are pure functions without Electron, with fixtures under `test/fixtures/`.
- No new runtime dependencies.
- Windows only, Electron 36, plain DOM renderer.

## Decisions made by the author of this document (not by the user)

1. Cursor excluded (no documented API). Other candidates (Gemini, Perplexity, Groq) have no usage API.
2. Default Copilot allowance is 300 (the Pro plan) and is editable; the right value depends on the user's plan.
3. Moonshot supports only the international endpoint.
4. Provider order in the widget follows the registry order; no reordering UI.
5. The settings detail view is navigated inside the same window (no extra windows).

## Risks

- None of the four new providers can be verified against a live account by the author. Fixtures follow the official examples, so the first real use may expose differences.
- The GitHub token type and permission needed for the premium-request endpoint is not stated on the documentation page the author read. The Copilot hint in the UI says to use a token that can read your billing data, and the exact permission needs checking on first use.
- More providers mean more requests per refresh cycle; the interval setting still controls the cadence.

## Left to the builder

Visual details of the settings screens within the existing style, exact wording of strings (en-US first, then es and pt-BR), and the internal structure of the generic settings code.

## Update (2026-10-24)

- Browser sign-in is limited to Claude and ChatGPT. Ollama is now API-key-only; its settings-page fallback and login window were removed.
- API keys are never written to `config.json` in plain text. Only encrypted blobs (`safeStorage`) are stored; if encryption is unavailable, secrets are not persisted at all.
- All local data lives under `~/.quotawidget/`: `config.json` at the root and the provider sign-in profiles under `profiles/`. The old Electron userData folder (`%APPDATA%/quota-widget` on Windows) is migrated once, and any plaintext keys left there are removed.
- Command Code is API-key-only; the local `~/.commandcode/auth.json` fallback was removed.

## Additional providers (2026-10-24)

OpenRouter and DeepSeek were already present. Added:

| Provider | Request | Notes |
|---|---|---|
| Synthetic | `GET https://api.synthetic.new/v2/quotas` | Subscription requests / limit, resets from `renewsAt`. |
| NanoGPT | `GET https://nano-gpt.com/api/management/v1/subscription/usage` | Usage-only management token. Daily/weekly input tokens and daily images. |
| OpenAI API | `GET https://api.openai.com/v1/organization/costs` | Admin key. Monthly cost, summed by currency. |
| Anthropic API | `GET https://api.anthropic.com/v1/organizations/cost_report` | Admin key. Monthly cost; the API returns cents, converted to dollars. |
| xAI (Grok) | `POST https://management-api.x.ai/v1/billing/teams/{team_id}/usage` | Management key + team ID. Monthly API spend in USD. |
| Mistral | `GET https://api.mistral.ai/v1/billing/usage` + `/v1/billing/subscription` | Billing access. The documented `/v1/admin/usage` response is a raw usage/price catalog without a simple total, so the billing endpoints power the card. |
| OpenCode Go | `GET https://opencode.ai/zen/go/v1/usage` | Console endpoint, Go plans only; not yet in the public Go docs. Rolling/weekly/monthly windows. |

Cost-only providers return `windows: []` plus a `note.cost_month` line. The new providers follow the same `settings` declarations and are disabled by default.

## Custom providers (2026-10-24)

Settings → Custom providers lets users add a provider without code. Each spec is stored in `config.json` and declares:

- `name`, `url`, `method` (`GET`/`POST`), `auth` (`bearer`, `header`, `none`), optional `headers`, and an optional JSON `body`;
- `mapping.windows` (`key`, optional `label`, `percent` path or expression, `scale` (`percent`/`fraction`), optional `resetsAt` and `detail` paths or expressions), an optional note (`template` + `values` paths or expressions), and an optional `plan` path or expression.

The main process validates the spec (HTTPS or localhost, max size, unique window keys, JSON body for POST) and fetches it with a 15-second timeout. Responses are mapped with dot/bracket paths or a safe expression subset; no arbitrary code is evaluated. The expression evaluator (`providers/expression.js`) allows property access, arithmetic, comparisons, ternaries, `Math.*`, `Number`/`String`/`Boolean`/`parseInt`/`parseFloat`/`isFinite`, and the methods `toFixed`, `toLocaleString`, `toString`, `trim`, `toUpperCase`, `toLowerCase`. It rejects `require`, `process`, `Function`, constructors, prototypes, assignment and loops; it does not use `eval` or `Function`. The API key is a declared secret field and is encrypted; the rest of the spec, including headers and body, is encrypted at rest in `customProvidersEnc` (config version 2). The editor opens new providers in a guided form for the common case and supports multiple windows and note values with Add/Remove rows; JSON remains available for exact editing. It offers usage/balance/monthly-cost templates, Copy JSON / Load JSON, and a **?** safe-expression help panel; copied specs never include the API key. The editor has a **Test** action that runs the same request without saving and previews the parsed result or error.

## 0.9 additions

- Config version 2 encrypts the custom-provider spec in `customProvidersEnc`; plaintext `customProviders` is migrated automatically and a pre-migration backup is written under `backups/`.
- Settings → Configuration can back up, export, import and reset the config. Import rejects plaintext keys/specs, validates the encryption with the current Windows user, backs up the current config and restarts the app. Reset also disables start with Windows.
- Optional Windows notifications fire at 90% and on a detected renewal; the master mute is in Settings and the tray menu.
- Each provider can override the refresh interval. Scheduled refreshes skip providers that are not due, add jitter, and use exponential backoff (cap 60 minutes) after failures; manual refresh bypasses the wait. Readings expose last success, latency, failure count, next retry and last error.
- The service detail can copy a diagnostic JSON (no secrets) for bug reports.

Refreshes run with a concurrency limit. A failed update keeps the last successful reading (marked stale) instead of blanking the card. Config writes are atomic and carry a `configVersion` for future migrations.

## Skins (0.11.0)

- `config.json` stores a non-secret `skin` (`classic` or `paper`); Classic is the default.
- Skins are CSS-only and loaded with a separate stylesheet after the base CSS. `data-skin` selects the active skin.
- The widget can change surfaces, typography, borders and bars without touching the main-process data flow. The Settings screen stays readable; the skin primarily targets the widget card.
- Settings → Appearance has a preview gallery with live preview, Save and Cancel-revert. The tray has a Skin submenu.
- Imported/JS skins are intentionally out of scope for now; the built-in skins are curated and safe.

## Dock layout (0.12.0)

- `layout` is `card` or `dock`; `dock` is `top`, `left` or `right`. The defaults are `card` and `top`.
- The top dock is a horizontal edge strip (`min(1100px, workArea - 24)` wide, 128px high) with one chip per enabled provider (208px wide). The provider name and plan sit at the left; every usage window is shown in a single compact column at the right; the note spans the bottom. Resets/details stay compact (the full card and side dock show them).
- Side docks are 300px wide, full work-area height and scroll vertically.
- The window geometry is owned by the main process. The renderer sends a `set-window-mode` (`settings`/`widget`) and content height; the main positions the dock on the display work area.
- Settings opens as a 360px panel; closing it restores the dock. The panel is not a separate window.
- This is an always-on-top overlay, not a native AppBar: it does not reserve desktop space. Auto-hide, multi-monitor pinning, drag-to-dock and AppBar integration remain future work.
- The dock is covered by the existing E2E bounds test (top strip height, settings width, return to card).
