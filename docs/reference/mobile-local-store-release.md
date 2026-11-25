# Local Store releases

Run commands from `mobile/` inside the Bycoda repository. Native builds
also use the parent repository's `src/`, `host/`, `packages/` and `public/`.
Expo generates the native projects. Gradle and Xcode compile locally and
reuse their caches. Fastlane sends the existing artifacts to the stores.
The existing EAS profiles remain available for cloud builds.

## Version and signing

Set the storefront version in both `app.json` and `package.json`. Increase
`expo.android.versionCode` and `expo.ios.buildNumber` in `app.json` above
the latest uploaded numbers before building an update. If moving back to EAS,
initialize its remote counters from the latest uploaded builds.

Keep keys and passwords outside the checkout. Use the upload keystore
already registered in Play Console when updating an existing app.
For a new app, create the upload key with an interactive password prompt.
Use the same password for both Android password variables with PKCS12.

```text
keytool -genkeypair -storetype PKCS12 -keystore "<absolute-path-to-bycoda-upload.p12>" -alias bycoda-upload -keyalg RSA -keysize 2048 -validity 10000
```

| Environment variable | Value |
| --- | --- |
| `BYCODA_ANDROID_KEYSTORE` | Absolute path to Android upload keystore |
| `BYCODA_ANDROID_KEY_ALIAS` | Upload key alias |
| `BYCODA_ANDROID_STORE_PASSWORD` | Upload keystore password |
| `BYCODA_ANDROID_KEY_PASSWORD` | Upload key password |
| `BYCODA_PLAY_JSON` | Google Play Developer API service account key JSON path |
| `BYCODA_APPLE_TEAM_ID` | Apple Developer Team ID used by Xcode |
| `BYCODA_ASC_KEY_FILE` | App Store Connect team API key `.p8` path |
| `BYCODA_ASC_KEY_ID` | App Store Connect Key ID |
| `BYCODA_ASC_ISSUER_ID` | App Store Connect Issuer ID |

In Play Console, grant the service account the Bycoda permissions needed for
the lanes in use. Set up Play App Signing and upload the first signed AAB
through the console before enabling API uploads.

On the Mac, sign in to the Apple Developer team in Xcode. The team needs
App Store distribution signing for `com.bycoda.mobile`,
`com.bycoda.mobile.widgets` and `com.bycoda.mobile.share-extension`,
including their configured capabilities. Create the app entry
in App Store Connect. Use an API key with permission to upload builds.
Listing edits and App Review submission require the corresponding App Store
Connect permissions.

Assign `group.com.bycoda.mobile` to all three App IDs. The main App ID
also needs Push Notifications, Sign in with Apple and Associated Domains.
Refresh the provisioning profiles after changing capabilities. With an
App Store Connect team key authorized for provisioning, pass
`provision_with_api:true` to the archive lane to authenticate Xcode.

## Build and test

Install mobile dependencies with the repo's pinned pnpm version. Use the
project's Android SDK and Java setup for Android. Use Xcode and CocoaPods for
iOS. Run Fastlane with Ruby and the Bundler version in `Gemfile.lock`.
Android can build on Windows and send the AAB to the Mac for uploading.

```text
pnpm store:android
bundle install
bundle exec fastlane ios archive
```

Run the iOS lane on the Mac. Artifacts land under `temp/local/store/`.
Android retains its generated project for incremental builds. Regenerate it
with `pnpm exec expo prebuild --platform android --clean --no-install`
after removing a native plugin or when Expo's generated files need a reset.
Before distribution, verify the package name, version, signing and device
behavior against the [release checklist](mobile-store-release.md).

Check the final AAB with [Google bundletool](https://github.com/google/bundletool/releases)
before uploading. The command validates the bundle, compares its app ID and
version code with `app.json`, and checks the target SDK, merged blocked
permissions, bundle page alignment, and 64-bit native ELF load segments.

```text
pnpm store:verify-android temp/local/store/android/app-release.aab /path/to/bundletool.jar
```

Verify the upload signature independently and test Play-generated APKs on a
16 KB device before production rollout.

```text
bundle exec fastlane android internal
bundle exec fastlane android internal track:closed-track-id
bundle exec fastlane ios upload_testflight
```

Pass `aab:/absolute/path/app-release.aab` or `ipa:/absolute/path/Bycoda.ipa`
when using a previously built artifact or copying it to a different machine.
For Play, use the track ID shown in the console. For TestFlight, wait for
processing and add the build to the intended testing group in the console.
To send Play release notes with an AAB, pass `notes:/path/to/play-metadata`
with `<locale>/changelogs/<versionCode>.txt` files.

## Store listing and release

Use Fastlane's locale directory structure for the approved listing text and
screenshots. Keep production listing changes and submission separate from
testing uploads. The store consoles still collect declarations, review
credentials, agreements and any required test evidence.

```text
bundle exec fastlane android listing metadata:/path/to/play-metadata
bundle exec fastlane android production_draft version_code:42 track:closed-track-id
bundle exec fastlane ios listing version:1.2.0 metadata:/path/to/ios-metadata screenshots:/path/to/ios-screenshots
bundle exec fastlane ios review version:1.2.0 build:42
```

Send the Android production draft for review and finish rollout in Play
Console. Once Apple approves the requested build, release it from App Store
Connect. Inspect store status for the exact version and build.
Use `replace_screenshots:true` only with a complete replacement set for the
App Store version, including all required locales and display sizes.

- [Google Play publishing with Fastlane](https://docs.fastlane.tools/actions/upload_to_play_store/)
- [App Store publishing with Fastlane](https://docs.fastlane.tools/actions/upload_to_app_store/)
