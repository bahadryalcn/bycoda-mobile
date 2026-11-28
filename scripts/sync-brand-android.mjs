/** Refresh only existing generated Android logo rasters; never prebuild/install. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const mobile = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((value) => value !== "--write") || args.length > 1)
  throw new Error("Usage: node scripts/sync-brand-android.mjs [--write]");
const write = args.includes("--write");
const config = JSON.parse(await fs.readFile(path.join(mobile, "app.json"), "utf8")).expo;
const resources = path.join(mobile, "android/app/src/main/res");
const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const names = ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp", "ic_launcher_monochrome.webp"];
const slash = (value) => value.split(path.sep).join("/");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const inside = (base, target) => {
  const relative = path.relative(base, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
};
const existing = [];
for (const density of densities) {
  for (const relative of [
    ...names.map((name) => `mipmap-${density}/${name}`),
    `drawable-${density}/splashscreen_logo.png`,
    `drawable-night-${density}/splashscreen_logo.png`,
  ]) {
    const target = path.join(resources, relative);
    const stat = await fs.lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink() || !inside(mobile, await fs.realpath(target)))
      throw new Error(`Refusing nonregular or escaped native resource ${relative}`);
    existing.push({ relative, target, beforeSha256: hash(await fs.readFile(target)) });
  }
}
if (!write || !existing.length) {
  console.log(JSON.stringify({ status: write ? "no-existing-native-resources" : "plan-only", resources: existing.map(({ relative }) => slash(relative)), nativeProjectGenerated: false }));
  process.exit(0);
}

const splash = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")?.[1];
if (!config.icon || !config.android?.adaptiveIcon?.foregroundImage || !splash?.image || (splash.dark && !splash.dark.image) || splash.drawable)
  throw new Error("Current icon and splash image configuration is required; review adapter for other configurations.");
const resolveInput = (input) => path.resolve(mobile, input);
const icon = resolveInput(config.icon);
const foregroundImage = resolveInput(config.android.adaptiveIcon.foregroundImage);
const monochromeImage = resolveInput(config.android.adaptiveIcon.monochromeImage);
const splashImage = resolveInput(splash.image);
const darkSplashImage = splash.dark ? resolveInput(splash.dark.image) : null;
const inputs = [icon, foregroundImage, monochromeImage, splashImage, ...(darkSplashImage ? [darkSplashImage] : [])];
for (const input of inputs) {
  const stat = await fs.lstat(input);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Logo inputs must be regular files.");
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const stage = path.join(mobile, "temp/local/brand-android-sync", stamp);
await fs.mkdir(stage, { recursive: true });
await fs.writeFile(path.join(stage, "README.md"), "# Android logo staging\n\nGenerated from current Expo logo inputs using installed Expo image plugins. Only pre-existing Android logo rasters are copied back. No native project generation, build, installation, credentials, or publication. Retained for byte-level comparison.\n");
const snapshots = new Map();
for (const [index, input] of inputs.entries()) {
  const bytes = await fs.readFile(input);
  const file = path.join(stage, `input-${index}.png`);
  await fs.writeFile(file, bytes);
  snapshots.set(input, { file, sha256: hash(bytes) });
}
const require = createRequire(path.join(mobile, "package.json"));
const expoRequire = createRequire(require.resolve("expo/package.json"));
const prebuildRoot = path.dirname(expoRequire.resolve("@expo/prebuild-config/package.json"));
const splashRoot = path.dirname(require.resolve("expo-splash-screen/package.json"));
const { setIconAsync } = require(path.join(prebuildRoot, "build/plugins/icons/withAndroidIcons.js"));
const { setSplashImageDrawablesForThemeAsync } = require(path.join(splashRoot, "plugin/build/withAndroidSplashImages.js"));
await setIconAsync(stage, {
  icon: snapshots.get(icon).file,
  foregroundImage: snapshots.get(foregroundImage).file,
  monochromeImage: snapshots.get(monochromeImage).file,
  backgroundColor: config.android.adaptiveIcon.backgroundColor,
  isAdaptive: true,
});
await setSplashImageDrawablesForThemeAsync(
  Object.fromEntries(densities.map((density) => [density, snapshots.get(splashImage).file])),
  "light",
  stage,
  splash.imageWidth,
);
if (darkSplashImage)
  await setSplashImageDrawablesForThemeAsync(
    Object.fromEntries(densities.map((density) => [density, snapshots.get(darkSplashImage).file])),
    "dark",
    stage,
    splash.imageWidth,
  );
const results = [];
for (const [input, snapshot] of snapshots)
  if (hash(await fs.readFile(input)) !== snapshot.sha256)
    throw new Error("Logo inputs changed during generation; no native resources copied.");
for (const item of existing) {
  const source = path.join(stage, "android/app/src/main/res", item.relative);
  const bytes = await fs.readFile(source);
  if (!inside(mobile, await fs.realpath(item.target)) || hash(await fs.readFile(item.target)) !== item.beforeSha256)
    throw new Error(`Native resource changed during generation: ${item.relative}`);
  await fs.writeFile(item.target, bytes);
  const sha256 = hash(await fs.readFile(item.target));
  if (sha256 !== hash(bytes)) throw new Error(`Native resource copy failed: ${item.relative}`);
  results.push({ path: slash(path.relative(mobile, item.target)), beforeSha256: item.beforeSha256, sha256, changed: sha256 !== item.beforeSha256 });
}
const receipt = { status: "updated-existing-native-rasters", nativeProjectGenerated: false, stage: slash(path.relative(mobile, stage)), inputs: [...snapshots].map(([input, snapshot]) => ({ path: slash(path.relative(mobile, input)), sha256: snapshot.sha256 })), resources: results };
await fs.writeFile(path.join(stage, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ status: receipt.status, resources: results.length, changed: results.filter((item) => item.changed).length, nativeProjectGenerated: false, receipt: slash(path.relative(mobile, path.join(stage, "receipt.json"))) }));
