# Building Quota Widget locally

You don't have to trust a downloaded installer: you can build the app from source in a few minutes. A locally built app is also never flagged by Windows SmartScreen, because the warning only applies to files downloaded from the internet.

## Requirements

- Windows 10 or 11 (x64)
- [Node.js](https://nodejs.org) 22.12 or newer (includes `npm`)
- [Git](https://git-scm.com)

No admin rights, Visual Studio or other build tools are needed.

## Steps

```bash
git clone https://github.com/edilsondjr/ai-quota-widget.git
cd ai-quota-widget
npm install
```

Then pick what you want:

| Goal | Command | Result |
|---|---|---|
| Run it right now | `npm start` | Opens the widget from source |
| Run the tests | `npm test` | Parser, settings and translation tests |
| Run the UI test | `npm run test:e2e` | Electron smoke test with a local fake provider |
| Build the installer | `npm run dist` | `dist/Quota-Widget-Setup-<version>.exe` |

`npm run dist` also leaves an unpacked copy of the app in `dist/win-unpacked/`. You can run `Quota Widget.exe` from there without installing anything, or move the folder wherever you like.

The first `npm install` downloads Electron (about 100 MB) and the first `npm run dist` downloads the installer tooling, so expect a few minutes and an internet connection.

## Installer size

The Windows build uses maximum compression and a solid 7z payload. Differential
packages are disabled because the app checks GitHub releases and opens the release
page for a full installer download; it does not use differential updates.

Electron's bundled language resources are limited to the app's six supported
languages: English, Spanish, Portuguese (Brazil), Chinese (Simplified), Japanese
and German. Electron may also retain regional variants such as `es-419`.
The Chromium runtime, graphics libraries and license notices remain included.

## Installing the result

- Double-click `dist/Quota-Widget-Setup-<version>.exe` and follow the wizard, or
- install silently for the current user: `Quota-Widget-Setup-<version>.exe /S`

To uninstall, use *Settings → Apps → Quota Widget*.

## Shortcut

`gerar-instalador.bat` in the repository root runs `npm install` and `npm run dist` for you and opens the `dist` folder.

## Verifying a downloaded installer

Release installers are built by GitHub Actions from the tagged source (see `.github/workflows/build.yml`). To check a downloaded file against the build you made yourself, compare hashes:

```powershell
Get-FileHash .\Quota-Widget-Setup-<version>.exe -Algorithm SHA256
```

Two builds of the same version are not guaranteed to be byte-identical, so a different hash does not mean the file is bad. When in doubt, build it yourself.

## Troubleshooting

- **The window never opens and `npm start` exits at once.** The environment variable `ELECTRON_RUN_AS_NODE` is set (common in terminals started from some editors). Unset it first: `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell.
- **`npm install` fails while downloading Electron.** Check your proxy or antivirus, then run `npm install` again.
- **Nothing happens after clicking the tray icon.** The app is single-instance; quit the running copy from the tray menu first.
- **Your settings live in** the folder opened by the tray menu entry *Open config folder*.
