import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const android = join(root, "android");
const { env } = process;
const required = [
  "BYCODA_ANDROID_KEYSTORE",
  "BYCODA_ANDROID_STORE_PASSWORD",
  "BYCODA_ANDROID_KEY_ALIAS",
  "BYCODA_ANDROID_KEY_PASSWORD",
];
const missing = required.filter((name) => !env[name]?.trim());
if (missing.length) throw new Error(`Set Android upload signing variables: ${missing.join(", ")}`);
if (!isAbsolute(env.BYCODA_ANDROID_KEYSTORE) || !statSync(env.BYCODA_ANDROID_KEYSTORE, { throwIfNoEntry: false })?.isFile()) {
  throw new Error("BYCODA_ANDROID_KEYSTORE must point to an existing absolute file path.");
}

const windows = process.platform === "win32";
function run(command, cwd) {
  const result = windows
    ? spawnSync(env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], { cwd, stdio: "inherit" })
    : spawnSync("/bin/sh", ["-c", command], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm check:release", root);
run("pnpm theme:build", root);
run("pnpm exec expo prebuild --platform android --no-install --no-clean", root);
run(windows ? ".\\gradlew.bat :app:bundleRelease" : "./gradlew :app:bundleRelease", android);

const output = join(root, "temp", "local", "store", "android");
mkdirSync(output, { recursive: true });
const bundle = join(output, "app-release.aab");
copyFileSync(join(android, "app", "build", "outputs", "bundle", "release", "app-release.aab"), bundle);
console.log(bundle);
