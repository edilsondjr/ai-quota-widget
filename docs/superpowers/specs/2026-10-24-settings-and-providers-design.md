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
