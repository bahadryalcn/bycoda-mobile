# Native input reports and internal preview evidence

These tools prepare and inspect the separate mobile repository. They do not replace native feature acceptance, the selected Host/provider checks or store release preparation. The existing [store readiness guide](mobile-store-release.md) remains separate. Source changes and fixture tests do not prove an installed preview contains them.

## Native fingerprint report

```sh
pnpm native:fingerprint --output temp/verification/native/current.json
pnpm native:fingerprint --baseline temp/verification/native/previous.json --output temp/verification/native/compared.json
```

The helper resolves the fingerprint package through this repository's installed Expo SDK rather than downloading another CLI. The implementation was checked against Expo `57.0.31` and its installed `@expo/fingerprint` `0.20.14` API. It uses the SDK's actual source collection, autolinking/config/plugin hashing and CNG decisions, with SHA-256, both platforms and no source-skip bits. It records tool/SDK/options, every source ID/hash/reason, and exact Git SHA plus working-source digest for both repositories. Source changes during measurement become `unknown`.

The SDK's blanket nested `node_modules` ignore also matches pnpm's real `.pnpm/.../node_modules/...` native packages. The helper explicitly removes that blanket and excludes nested dependencies _inside_ those packages instead. This preserves actual native package input hashes. Other SDK default build/cache exclusions remain. An SDK-confirmed generated CNG native directory is labelled `generated-native-excluded`; any other missing/excluded source hash makes comparison unknown. It never substitutes a hand-written file hash for an unavailable Expo measurement.

The lock/workspace configuration, local native modules, dependency patches and parent brand assets are native inputs. Parent `src/` and `packages/core` are recorded separately as shared JavaScript source provenance: a pure JS change does not advise a native rebuild merely because that source digest changed. The SDK may independently classify an actual config/plugin/autolinking change as native.

Results are advisory: `native-input-change` advises rebuilding; `no-native-input-change` says only that this measured input set did not change. Neither means binary compatibility, a successful build or device acceptance. Missing baseline/tooling, changed SDK/options, incomplete inputs or concurrent source drift yields `unknown`. Hashes and source identifiers are retained; config contents, environment variables and credentials are not printed. Do not store raw fingerprint content sources containing private configuration.

## Explicit internal EAS preview

```sh
pnpm preview:plan --platform android --eas-version <exact-numeric-version>
pnpm preview:plan --platform ios-simulator --eas-version <exact-numeric-version>
```

The default is an offline plan. The existing `preview` profile produces an internal Android APK; `preview-simulator` extends it for an iOS simulator. Preview profiles explicitly disable version auto-increment and development-client builds. Existing production settings are preserved. No OTA channel, submission profile, store upload or physical iOS provisioning is selected.

The optional `Manual internal mobile preview` workflow runs only from mobile `main`. Its dispatch requires one exact trusted parent commit, an existing Expo project UUID, an exact owner-selected EAS CLI version and explicit authorization for one potentially billable remote build. It checks that the parent SHA belongs to the parent repository's trusted main history. A missing `EXPO_TOKEN` fails before CLI bootstrap or remote submission; the workflow does not request, create or print a credential. It installs that exact CLI only on its hosted runner after the explicit dispatch gates. This source work did not install or call EAS locally.

Both exact repositories are checked out into the expected parent/mobile layout. The mobile repository installs its own frozen dependencies; it does not borrow parent `node_modules`. Direct mobile `zod` uses the already parent-pinned `4.6.7` because mobile's production Host contracts import it. `@lezer/markdown` uses the parent-locked `1.8.1` because shared attachment-token parsing is part of mobile queue editing. These fix actual ambient runtime dependencies rather than introduce a new SDK or scaffolding library. The isolated Android JS export, not file copying or type resolution through a live parent install, verifies that this source graph can bundle.

The native icon/adaptive/monochrome references now use canonical `assets/brand/` files owned by mobile. They are exact copies of the existing rasters, with source and SHA-256 provenance in [the asset README](../../assets/brand/README.md). The parent originals were machine-locally excluded and absent from a hosted checkout; leaving those references in place would make a source-only preview unusable. No art or UI appearance was changed. This path/config ownership change is still a real native input change and the fingerprint reports it as such.

The preview helper refuses dirty mobile source or dirty parent preview inputs and stages a new ignored source archive containing mobile-maintained source plus parent `src/`, `packages/core` and `public/brand`. The parent clean-state check is scoped to those exact copied inputs, so the independent nested mobile checkout and unrelated parent documents cannot make an otherwise complete archive appear dirty. No root manifest, root dependencies, Git metadata, `.env` content, credential files or existing native build outputs are copied. The parent inputs are necessary because current mobile code and assets reference them outside the mobile Git root. Source identities are checked again after staging; drift prevents submission. Dynamic Expo config needs a reviewed staging adapter and fails closed rather than being overwritten.

Only the staged `app.json` receives the explicitly supplied existing Expo project ID and a public `extra.bycodaPreviewSource` stamp containing exact mobile/parent SHAs and the pre-stamp input digest. The maintained app config is untouched. `preview-source.json` records original source identities, transformations, actual staged file hashes and both the pre-stamp and final stamped archive digests. The pre-stamp digest avoids a self-referential hash. Never add credentials to this public stamp.

EAS runs from the staged `mobile` project with `EAS_NO_VCS=1` and an explicit absolute `EAS_PROJECT_ROOT` pointing at its archive parent. This is the documented [No VCS archive boundary](https://docs.expo.dev/build-reference/project-upload/). The archive's `.easignore` is generated at that boundary. No main checkout file, Git branch, user data or credential store is changed.

For an independently authorized local invocation, `--run --allow-remote-build` additionally requires `EXPO_TOKEN`, the exact preinstalled CLI version and an existing `--project-id`. The helper never installs that CLI. `--freeze-credentials` prevents noninteractive credential updates; any necessary signing setup remains a separate owner action. One request is made, with no automatic retries. The default `--no-wait` result is `pending`; a timeout or lost outcome is uncertain and must be inspected in EAS before retrying. Simulator result metadata is validated as `SIMULATOR`, while Android expects `INTERNAL`. Even `FINISHED` is reported as `build-finished-artifact-unverified`: no artifact was downloaded, installed or submitted to a store. See [EAS CLI](https://docs.expo.dev/eas/cli/) and [internal distribution](https://docs.expo.dev/build/internal-distribution/).

## Brand inputs

Brand inclusion is checked before a preview archive is accepted. In addition to
the mobile-owned launcher/adaptive PNGs, staging requires the parent
`mark-white.png`, `logo-horizontal-white.png` and `favicon-32.png` used by the
runtime mark/avatars, wordmark, Expo splash and web favicon. Missing files fail
archive preparation instead of producing a preview with incomplete branding.
For existing ignored Android projects, use the explicit raster refresh command
in [the brand asset guide](../../assets/brand/README.md#existing-local-android-resources)
after synchronizing canonical assets. This updates source inputs only; native
build and installed-device acceptance remain separate.

## Owned virtual-device showcase

```sh
pnpm showcase --request temp/verification/showcase/request.json
```

This optional capture entry consumes an already available preview artifact and an explicitly selected, booted virtual device. It never chooses a physical phone, installs/launches the target app, changes its theme, navigates it, resets it or removes data. Prepare the existing screen through the owner's normal workflow first. The `Manual owned virtual-device showcase` workflow is manual, trusted-main-only and uses a dedicated `self-hosted, bycoda-showcase` runner. Its input is an existing request JSON path on that owned runner; no store or Expo credential is used.

Required request shape (replace bracketed values with actual evidence; these placeholders deliberately fail validation):

```json
{
  "schemaVersion": 1,
  "platform": "android",
  "deviceId": "emulator-5554",
  "allowExistingVirtualDevice": true,
  "packageId": "com.bycoda.mobile",
  "artifact": {
    "path": "/explicit/path/to/internal-preview.apk",
    "sha256": "<actual artifact SHA-256>",
    "source": {
      "mobileSha": "<exact mobile commit>",
      "parentSha": "<exact parent commit>",
      "archiveSha256": "<preview-source.json sourceSha256>"
    }
  },
  "expectedSource": {
    "mobileSha": "<same explicitly requested mobile commit>",
    "parentSha": "<same explicitly requested parent commit>",
    "archiveSha256": "<same explicitly requested input digest>"
  },
  "theme": "dark",
  "viewport": { "width": 1080, "height": 2400 },
  "evidenceKind": "fixture",
  "output": "temp/verification/showcase/unique-run-id"
}
```

Use `platform: "ios"`, the exact simulator UUID and a materialized `.app` directory for iOS. Its SHA-256 is `artifactHash()` from `scripts/preview-support.mjs`: SHA-256 of sorted relative-file-path/content-hash pairs. It rejects bundle links and special files; a file checksum of a downloaded `.tar.gz` is not this app-directory checksum. Preserve both archive/download evidence and the materialized bundle identity. Android expects a single installable APK, not an AAB or split APK collection.

Before touching a device, the helper validates the request, source identity equality and artifact bytes. It reads `extra.bycodaPreviewSource` from the binary's bundled Expo Constants public config (`assets/app.config` in an APK; `EXConstants.bundle/app.config` in a simulator app). These paths come from the installed Expo Constants native build scripts. Android ZIP inspection uses Python's standard library (`python` on Windows, `python3` elsewhere); missing tools/config/stamp or a mismatching package/source is a failure, never a version-based source guess. Old unstamped builds are not accepted as containing new source.

Android then verifies the selected ADB serial is online and `ro.kernel.qemu=1`, checks the current resumed activity and actual night-mode value, and hashes the installed single `base.apk` against the supplied artifact. Foreground, virtual-device and installed-byte checks run again after the screenshot. No shell command string or caller-provided executable is accepted. ADB must be installed and available explicitly on the diagnostic machine.

iOS uses only `simctl` booted/available simulator entries, validates the installed app container bytes, and reads current appearance without changing it. Because a running process does not prove foreground state, a generated Xcode XCTest probe asserts `XCUIApplication.state == runningForeground` both before and after capturing the app screenshot. It does not call `launch()` or `activate()`. Xcode may install its separate `com.bycoda.showcaseprobe.xctrunner` test runner on the explicitly selected simulator; it does not install or mutate the target app. A nonce-bound screenshot is retrieved from that probe's container. Xcode, simulator/runtime and successful foreground proof are required; failure produces no passing screenshot receipt. Native execution of this generated probe still needs an actual Mac verification.

The PNG's actual pixel dimensions must equal the requested viewport. Outputs go to a new ignored directory and include capture SHA-256, embedded source proof, artifact identity, device/platform, theme, dimensions, time and evidence kind. Existing evidence is not overwritten. `fixture` remains fixture evidence even inside a native binary. `native-screen` means only the named screen was captured in an artifact-matching virtual app; it does not establish feature behavior, real Host/provider transport or physical-device acceptance.

## Local checks and action provenance

The mobile TypeScript config excludes ignored `temp/**` source archives while retaining the installed Expo base exclusions for dependencies, native outputs and tool configs. Staging or verification evidence therefore cannot pollute ordinary application type checks.

```sh
node --test scripts/native-fingerprint.test.mjs scripts/preview.test.mjs scripts/showcase.test.mjs
pnpm exec tsc-rs --noEmit
```

Tests cover actual source bytes/stamps, schema/authorization failures, pending truth, source mismatch, virtual-device/foreground/theme checks, exact installed-artifact comparison, viewport mismatch, and failure receipts. Device command responses in these tests are synthetic; one ZIP inspection test uses a real standard-library-created ZIP fixture. They do not contact EAS, ADB or a simulator.

New workflows reuse verified commits from the official repositories: [checkout](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262), [setup-node](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020), [pnpm setup](https://github.com/pnpm/action-setup/commit/b906affcce14559ad1aafd4ab0e942779e9f58b1) and [artifact upload](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02). Permissions are `contents: read`; checkout credentials are not persisted. Publication, OTA and production device changes remain outside these workflows.
