# Native mobile brand assets

These maintained PNGs are the self-contained Expo native icon inputs. They use the same six-lobed tea saucer, separate outlined rim drops and bold `</>` center as the shared product mark.

| Canonical mobile file | Generated counterpart in the parent checkout |
| --- | --- |
| `mobile-icon.png` | `public/brand/bycoda/mobile-icon.png` |
| `mobile-adaptive-foreground.png` | `public/brand/bycoda/mobile-adaptive-foreground.png` |

`app.json` points directly at these files for the app icon, adaptive foreground and monochrome icon. Both are 1024 × 1024. The app icon uses an opaque black background; the adaptive foreground keeps transparency and inset artwork for system masks.

From the parent checkout, regenerate shared artwork first, then synchronize these files explicitly:

```sh
node scripts/build/generate-brand.mjs
node scripts/build/generate-native-brand.mjs --sync-mobile
```

The synchronization requires this mobile checkout and copies the generated PNG bytes without another transform. Parent mobile PNG counterparts may be locally ignored; do not rely on them being tracked. Keep these native inputs in the mobile repository. Preview staging copies them as ordinary mobile source. Parent shared splash/favicon assets and source contracts remain separate preview inputs.

Regeneration changes source assets only. Native bundles must be rebuilt and installed separately before launcher or splash changes appear on a device.

## Existing local Android resources

An existing ignored `android/` project can still hold older launcher and splash
rasters. After canonical regeneration/synchronization, inspect and explicitly
refresh those existing files from the mobile directory:

```sh
node scripts/sync-brand-android.mjs
node scripts/sync-brand-android.mjs --write
```

The default command only lists existing resource targets. `--write` uses the
installed Expo image plugins in isolated `temp/local/brand-android-sync/`
staging, then replaces only pre-existing launcher/adaptive/monochrome WEBPs and
splash PNGs in the five Android density folders. It preserves native project
configuration and does not create a native project, build, install or publish.
A retained receipt records input and output SHA-256 values. With no existing
native resources, it reports that state without generating a project.
