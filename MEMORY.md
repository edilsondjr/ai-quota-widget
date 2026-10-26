# Quota Widget — project memory

Last updated: 2026-10-26

This file is the working memory for the project. Update it after any release,
distribution change or significant product decision. It is not shipped in the
installer.

## Where we are

- **Released app version:** `0.14.1` (security release).
  - Tag `v0.14.1` points to commit `5f405c4`.
  - Latest `main` commit is `c350b6b` (release-notes warning).
- **0.15.0:** prepared for release; publication is pending the GitHub tag workflow.
- **Tests:** 114/114 unit tests and 1/1 Electron E2E passing. The E2E includes
  the empty state, single-window check, density, Esc shortcut, configured/available
  grouping, activation after adding credentials, drag-and-drop persistence, and
  disabling/re-enabling a configured service. The same E2E passed against the
  packaged 0.15.0 executable with isolated data. In this environment E2E needed to
  run outside the Codex tool sandbox due to Electron's Windows install ACL check.
- **Local build:** `dist/Quota-Widget-Setup-0.15.0.exe`
  - 115.74 MB
  - SHA256 `21770D048AA7C30C44F2BB2F99DA5163EFBABABE5DE7DD87DA627D1F6135F4A0`
  - Built with Electron 45.0.0 and electron-builder 26.18.0.
  - The NSIS installer was built but not installed locally, to avoid changing
    the existing user installation. The packaged executable passed E2E.
- **Security:** Electron 45.0.0, electron-builder 26.18.0, Node >= 22.12.
  `npm audit` is at 0 vulnerabilities. Provider windows have permission denial,
  HTTPS-only navigation, popup restrictions and explicit `nodeIntegration: false`.
- **Site:** `https://beamglyph.com/quota-widget/` is live. Cloudflare is connected
  to the GitHub repository, so pushes to `beamglyph-site/main` deploy
  automatically. Site commits: `7535f1c` (landing page), `fe669bb` (README).
- **GitHub app repo:** homepage points to the live landing page; topics are set.
  Social preview image is **not uploaded** yet.
- **winget:** PR `microsoft/winget-pkgs#460637` for version `0.4.0` is still open
  in manual policy review. Do not modify it until accepted.
- **SignPath:** deferred. No SignPath docs are in the public app repo; copies are
  in the session scratchpad if needed later.
- **Translations:** `en-US`, `es`, `pt-BR`, `zh-CN`, `ja-JP`, `de-DE`. The last
  three are drafts and have not had native review.

## What 0.15.0 adds

- First-run empty state with a direct “Open settings” action.
- Comfortable/Compact density.
- Keyboard shortcuts: `Ctrl+R`, `Ctrl+,`, `Ctrl+Shift+P`, `Esc`.
- Accessible labels on icon buttons and visible focus rings.
- Settings button on provider card.
- Service order: Default, Custom, Most urgent first.
- Favorites; in Custom order, the manual order is exact and favorites do not
  reorder above it.
- Drag-and-drop per-provider reordering in Settings → Services (Custom order mode).
- Settings separates Configured and Available services. Classification uses saved
  credentials, known browser sessions, or Custom providers without authentication.
- Only configured and enabled services appear in the widget. Newly supplied
  credentials enable the service; configured services may still be disabled.
- Browser sign-in is available in Settings; remembered setup status survives
  disabling a service or a temporary collection failure.
- Search/filter in the service list.
- Per-provider notification threshold (default 90%).
- Notification snooze from Settings and the tray: Off / 1 hour / 8 hours / until
  tomorrow.
- Reduced-motion and high-contrast CSS support.
- Provider error actions link directly to that provider’s Settings.

## Decisions and constraints

- **No telemetry.** The app does not auto-check for updates. “Check for updates”
  is manual and only opens the release page.
- **Windows-only.** No macOS/Linux work in the current scope.
- **Installer is unsigned.** Every release and every existing release body now
  warns about SmartScreen / “Unknown publisher”. Future releases append this
  warning automatically in `.github/workflows/build.yml`.
- **Node 22.12+** is required by Electron 45. CI build uses Node 22; tests cover
  22 and 24.
- **No custom code execution.** Custom provider expressions remain a safe subset
  (no `eval`, `Function`, constructors, assignment or loops).
- **No paid advertising yet.** Launch should be organic and feedback-led.
- **No cloud sync, charts/sparklines, new skins or mobile** in this batch.
- **Custom order beats favorites.** Favorites are a visual marker; the custom
  order is the exact display order.
- **Cloudflare deployment is Git-driven.** Do not run manual `wrangler deploy`
  unless the Git integration is unavailable.
- **Do not publish internal SignPath setup docs** in the public app repo.

## Validation checklist for 0.15.0

Run this before bumping or tagging:

- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] `npm run dist`
- [ ] Install the generated build and test the packaged app, not only the source.
- [ ] Empty state: no provider enabled; CTA opens Settings.
- [ ] Custom order: drag providers; Save; close/reopen Settings; order
      persists through a restart.
- [ ] Custom order: card and dock follow the exact saved order.
- [ ] Configured services appear first in Settings; Available services cannot
      be enabled before setup. Custom providers without auth count as configured.
- [ ] Adding a key activates the service; disabling a configured service keeps
      it in Configured. Browser services can be signed into from Settings.
- [ ] Default and Most urgent order still work.
- [ ] Favorites toggle and persist; custom order is not overridden by them.
- [ ] Search filters providers and does not break reordering.
- [ ] Provider gear opens that provider’s detail screen.
- [ ] Density Compact/Comfortable persists and does not clip text.
- [ ] Notification threshold changes the alert point; 90% is the default.
- [ ] Snooze 1h/8h/tomorrow works from Settings and the tray; notifications
      resume after expiry.
- [ ] `Ctrl+R`, `Ctrl+,`, `Ctrl+Shift+P`, `Esc` work.
- [ ] Reduced motion and high contrast are respected.
- [ ] Card remains 336px; Settings remains usable at 360px.
- [ ] Release notes include the unsigned/SmartScreen block.

## Next steps

### 1. Finish QA and release 0.15.0

1. Review the working-tree diff.
2. Move `CHANGELOG.md` from `Unreleased` to `0.15.0`.
3. Bump the app:
   ```powershell
   npm version 0.15.0 --no-git-tag-version
   ```
4. Re-run:
   ```powershell
   npm test
   npm run test:e2e
   npm run dist
   ```
5. Commit and push:
   ```powershell
   git add -A
   git commit -F -   # use the repo commit template with co-author trailer
   git push origin main
   git tag -a v0.15.0 -m "Quota Widget 0.15.0"
   git push origin v0.15.0
   ```
6. Watch the **Release installer** workflow. Confirm:
   - installer and `SHA256SUMS.txt` assets;
   - tests/E2E/build passed;
   - release body contains the unsigned/SmartScreen warning;
   - winget job is skipped unless `WINGET_PUBLISH=true`.
7. Do not upload the local 0.14.1 build to the 0.14.1 release.

### 2. Remaining UX backlog

Prioritized:

1. **Dock/focus work**: adaptive width, single-provider focus mode, possibly
   auto-hide. This needs geometry/layout work in `main.js` and CSS.
2. **Per-provider reset**: reset only one service (keys, custom spec, readings)
   with confirmation; avoid “reset everything”.
3. **Credential hint**: show only the last 4 characters of a stored key, with a
   reveal action limited to that hint (never expose the full secret).
4. **Notification digest**: daily summary instead of only threshold/renewal
   events; decide whether it is opt-in.
5. **Update badge**: a discreet badge on the card/tray. This requires a
   background check, which conflicts with the current manual-only update policy;
   decide the privacy trade-off first.
6. **Full accessibility pass**: complete keyboard path, 200% zoom, screen-reader
   announcements, no clipped labels at Compact density.
7. **Search empty state**: show “No services match” when the filter hides all.
8. **Snooze active state**: the Settings select currently starts at “Off” even
   when `mutedUntil` is active; show the active expiry or a dedicated state.
9. **Native translation review** for `zh-CN`, `ja-JP`, `de-DE`; update docs
   translations where needed.
10. **Drag-and-drop reorder** is implemented in Settings → Services for Custom
    order mode.

### 3. Launch

Assets already prepared:

- Landing page: `https://beamglyph.com/quota-widget/`
- Demo GIF and social card in `beamglyph-site/public/assets/projects/`
- Launch copy: `beamglyph-site/marketing/quota-widget-launch.md`

Before launching:

- [ ] Upload the GitHub social preview in repository Settings using
      `public/assets/projects/quota-widget-social.png`.
- [ ] Re-check SmartScreen wording on the release page.
- [ ] Soft launch in `r/SideProject` and `r/coolgithubprojects`.
- [ ] Then Show HN, Product Hunt, targeted Reddit posts and LinkedIn/X.
- [ ] Use disclosure (“I built it”), screenshots/GIF and feedback request.
- [ ] Do not use paid ads until landing conversion and installer friction are
      acceptable.
- [ ] Track downloads, GitHub stars, referrers/UTMs, winget installs and
      voluntary feedback. Do not add in-app telemetry.

### 4. Distribution and trust

- **winget:** wait for `#460637` to be accepted, then update the manifest to the
  current release and its new SHA256. Do not modify the open PR yet.
- **SignPath:** future option; OSS program, publisher is SignPath Foundation.
  Revisit after reputation/traction; not part of 0.15.0.
- **Microsoft Store/MSIX:** future option for zero SmartScreen warnings and
  discovery; needs packaging and Store account.
- **Code signing:** unsigned installer remains the main conversion risk.
- **Site:** after 0.15.0, update the landing page feature copy if the new order,
  search, snooze or thresholds should be mentioned there.

## Useful files

- `main.js` — config defaults, ordering/favorites, notifications/snooze/threshold,
  window/tray, provider windows.
- `renderer/renderer.js` — empty state, settings, ordering, favorites, search,
  density, shortcuts, provider detail.
- `renderer/style.css` — density, empty state, focus, reduced motion/high contrast,
  reorder controls.
- `locales/*.json` — six UI languages.
- `e2e/electron.e2e.js` — Electron smoke test and UX assertions.
- `.github/workflows/build.yml` — release, checksums, SmartScreen warning, winget.
- `PRIVACY.md`, `README.md`, `docs/BUILDING.md`.
- `beamglyph-site/public/quota-widget/` — live landing page.
- `beamglyph-site/marketing/quota-widget-launch.md` — launch copy.
