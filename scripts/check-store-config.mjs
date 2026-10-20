import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Source preparation only. This command does not sign, upload or certify a release.
const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const [{ expo: app }, eas, pkg] = await Promise.all([
  readJson("app.json"),
  readJson("eas.json"),
  readJson("package.json"),
]);
const errors = [];
const pending = [];
const requireValue = (valid, message) => {
  if (!valid) errors.push(message);
};

function publicHttps(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      host === "localhost" ||
      !host.includes(".") ||
      host.endsWith(".local") ||
      host.endsWith(".ts.net") ||
      host.includes(":") ||
      /^[\d.]+$/.test(host)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

requireValue(
  /^pnpm@12\./.test(pkg.packageManager ?? ""),
  "Use the pinned pnpm 12 package manager.",
);
requireValue(/^\d+\.\d+\.\d+$/.test(app.version ?? ""), "Set a numeric marketing version.");
requireValue(
  pkg.version === app.version,
  "Keep package.json and app.json marketing versions aligned.",
);
requireValue(
  /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*){2,}$/.test(app.ios?.bundleIdentifier ?? ""),
  "Set an iOS bundle identifier.",
);
requireValue(
  app.ios?.bundleIdentifier === app.android?.package,
  "Keep the configured iOS and Android application identifiers aligned.",
);
requireValue(
  /^\d+(?:\.\d+){0,2}$/.test(app.ios?.buildNumber ?? ""),
  "Set the initial iOS build number.",
);
requireValue(
  Number.isInteger(app.android?.versionCode) && app.android.versionCode > 0,
  "Set a positive initial Android version code.",
);
requireValue(
  eas.cli?.appVersionSource === "remote" && eas.build?.production?.autoIncrement === true,
  "Production must use remote build numbers with autoIncrement.",
);
requireValue(
  eas.build?.production?.distribution === "store" &&
    eas.build.production.android?.buildType === "app-bundle",
  "Production must use store distribution and an Android App Bundle.",
);
requireValue(
  eas.build?.preview?.distribution === "internal" && eas.build.preview.android?.buildType === "apk",
  "Preview must use internal distribution and an Android APK.",
);
requireValue(eas.build?.production?.ios?.simulator !== true, "Do not submit a simulator build.");

const plugins = new Map(
  (app.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin : [plugin, {}])),
);
const camera = plugins.get("expo-camera");
const authentication = plugins.get("expo-local-authentication");
requireValue(
  typeof plugins.get("expo-image-picker")?.cameraPermission === "string" &&
    !app.android?.blockedPermissions?.includes("android.permission.CAMERA"),
  "Image picker must not block the QR scanner's Android camera permission.",
);
requireValue(plugins.has("expo-notifications"), "Configure native notification permissions and channel.");
requireValue(
  plugins.has("expo-secure-store"),
  "Keep the native protected credential store enabled.",
);
requireValue(
  typeof authentication?.faceIDPermission === "string" &&
    authentication.faceIDPermission.trim().length > 0,
  "Explain the Face ID permission.",
);
requireValue(
  typeof app.ios?.infoPlist?.NSLocalNetworkUsageDescription === "string",
  "Explain local-network access on iOS.",
);
requireValue(
  typeof camera?.cameraPermission === "string" &&
    camera.cameraPermission.trim().length > 0 &&
    camera.recordAudioAndroid === false &&
    camera.microphonePermission === false,
  "QR scanning must explain camera access and disable microphone recording.",
);
for (const permission of [
  "RECORD_AUDIO",
  "SYSTEM_ALERT_WINDOW",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
]) {
  requireValue(
    app.android?.blockedPermissions?.includes(`android.permission.${permission}`),
    `Block unused Android ${permission}.`,
  );
}
requireValue(
  !app.ios?.infoPlist?.NSMicrophoneUsageDescription,
  "QR-only builds must not request microphone access.",
);
requireValue(
  app.ios?.privacyManifests?.NSPrivacyTracking === false,
  "Reassess the declared privacy manifest if tracking is introduced.",
);
requireValue(
  Array.isArray(app.ios?.privacyManifests?.NSPrivacyAccessedAPITypes) &&
    app.ios.privacyManifests.NSPrivacyAccessedAPITypes.length > 0,
  "Keep required-reason API declarations; audit the signed archive too.",
);

for (const [label, asset] of [
  ["app icon", app.icon],
  ["adaptive icon", app.android?.adaptiveIcon?.foregroundImage],
]) {
  requireValue(typeof asset === "string", `Configure the ${label}.`);
  if (typeof asset !== "string") continue;
  try {
    const png = await readFile(path.resolve(root, asset));
    requireValue(
      png.length >= 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      `${label} must be a PNG.`,
    );
    if (label === "app icon" && png.length >= 24) {
      requireValue(
        png.readUInt32BE(16) === 1024 && png.readUInt32BE(20) === 1024,
        "Use a 1024 × 1024 app icon.",
      );
    }
  } catch {
    errors.push(`The configured ${label} is missing.`);
  }
}

const engagement = app.extra?.engagement ?? {};
for (const [key, label] of [
  ["iosAppStoreUrl", "App Store"],
  ["androidPlayStoreUrl", "Google Play"],
]) {
  const value = engagement[key];
  if (value == null || value === "") {
    pending.push(`${label} listing is not configured; its rating action stays unavailable.`);
    continue;
  }
  const url = publicHttps(value);
  const valid =
    key === "iosAppStoreUrl"
      ? url?.hostname === "apps.apple.com" &&
        /^(?:\/[a-z]{2})?\/app\/(?:[^/]+\/)?id[1-9]\d*\/?$/.test(url.pathname)
      : url?.hostname === "play.google.com" &&
        url.pathname === "/store/apps/details" &&
        url.searchParams.getAll("id").length === 1 &&
        url.searchParams.get("id") === app.android.package;
  requireValue(valid && !url.hash, `Configure the real ${label} listing for this app.`);
}
const publicUrl = publicHttps(engagement.publicAppUrl);
requireValue(
  publicUrl &&
    !publicUrl.search &&
    !publicUrl.hash &&
    !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|tailscale\.net)$/.test(
      publicUrl.hostname.replace(/\.+$/, ""),
    ),
  "Configure a public HTTPS app URL for sharing; never use a pairing/host URL.",
);
for (const relative of ["src/features/legal/legal-content.ts", "app/demo.tsx", "app/report.tsx"]) {
  try {
    await access(path.join(root, relative));
  } catch {
    errors.push(`Missing release preparation surface: ${relative}.`);
  }
}

if (errors.length) {
  process.stderr.write(
    `Mobile store source configuration failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Mobile store source configuration passed. No build, upload or store acceptance was performed.\n",
  );
}
process.stdout.write(
  [
    ...pending,
    "Email reporting is a support flow; Google AI reporting still needs in-app delivery and an operational moderation process.",
    "Before submission: verify public privacy/support URLs, store disclosures, reviewer access, signing, SDK/merged permissions, physical-device behavior and Apple architecture review.",
    "See docs/reference/mobile-store-release.md for the remaining release evidence.",
  ]
    .map((item) => `Pending: ${item}`)
    .join("\n") + "\n",
);
