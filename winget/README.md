# winget manifests

Manifests for publishing Quota Widget to the Windows Package Manager community repository
([microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs)). Package id: `BeamGlyph.QuotaWidget`.

Once a version is accepted, users install it with:

```powershell
winget install BeamGlyph.QuotaWidget
```

## Submitting a version

The folder layout mirrors winget-pkgs (`manifests/b/BeamGlyph/QuotaWidget/<version>/`).

With [wingetcreate](https://github.com/microsoft/winget-create) (it forks the repo and opens the pull request for you):

```powershell
winget install Microsoft.WingetCreate
wingetcreate submit winget\manifests\b\BeamGlyph\QuotaWidget\<version>
```

Or by hand: fork `microsoft/winget-pkgs`, copy the version folder into `manifests/b/BeamGlyph/QuotaWidget/`, and open a pull request titled `New package: BeamGlyph.QuotaWidget version <version>`.

Validate before submitting:

```powershell
winget validate --manifest winget\manifests\b\BeamGlyph\QuotaWidget\<version>
```

## Updating for a new release

After the GitHub release (and its installer) is published:

```powershell
wingetcreate update BeamGlyph.QuotaWidget --version <version> --urls https://github.com/edilsondjr/ai-quota-widget/releases/download/v<version>/Quota-Widget-Setup-<version>.exe --submit
```

This downloads the installer, computes the SHA256 and opens the pull request. The release workflow can do this for you; see the `winget` job in `.github/workflows/build.yml` (it needs the `WINGET_TOKEN` secret and the `WINGET_PUBLISH` variable, and only works after the first version is accepted). Keep a copy of the accepted manifest here if you want it versioned in this repository.
