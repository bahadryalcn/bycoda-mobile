/** Advisory Expo-native input comparison. No prebuild, build, install or remote calls. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { options, readJson, sourceIdentity, writeReport, slash } from "./preview-support.mjs";

export const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
export const parentInputs = ["src", "packages/core", "public/brand"];

export function compareNative(before, after) {
  if (
    !before ||
    before.status !== "measured" ||
    after.status !== "measured" ||
    before.tool?.version !== after.tool?.version ||
    before.expoVersion !== after.expoVersion ||
    JSON.stringify(before.environment) !== JSON.stringify(after.environment) ||
    JSON.stringify(before.settings) !== JSON.stringify(after.settings) ||
    !before.sources?.length ||
    !after.sources?.length ||
    [...before.sources, ...after.sources].some(
      (source) => !source.hash && source.state !== "generated-native-excluded",
    )
  )
    return {
      status: "unknown",
      nativeRebuild: "unknown",
      reason:
        "Missing/incomplete inputs, changed SDK/fingerprint settings, or unavailable baseline; never infer compatibility.",
    };
  const old = new Map(
    before.sources.map((source) => [JSON.stringify([source.type, source.id]), source.hash]),
  );
  const current = new Map(
    after.sources.map((source) => [JSON.stringify([source.type, source.id]), source.hash]),
  );
  const changes = [...new Set([...old.keys(), ...current.keys()])]
    .sort()
    .filter((key) => old.get(key) !== current.get(key))
    .map((key) => ({
      source: JSON.parse(key),
      state: !old.has(key) ? "added" : !current.has(key) ? "removed" : "changed",
    }));
  const changed = before.nativeHash !== after.nativeHash || changes.length > 0;
  return {
    status: changed ? "native-input-change" : "no-native-input-change",
    nativeRebuild: changed ? "advised" : "not-indicated-by-this-fingerprint",
    changes,
    limitation:
      "Advisory input equivalence only. This is not binary/runtime compatibility or native build/device acceptance. Shared JS source provenance is reported separately.",
  };
}

export async function fingerprint(root = mobileRoot) {
  const environment = {
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
  };
  const settings = {
    platforms: ["android", "ios"],
    hashAlgorithm: "sha256",
    sourceSkips: 0,
    concurrentIoLimit: 4,
    silent: true,
    ignorePaths: [
      "!**/node_modules/**/node_modules/**",
      "**/node_modules/.pnpm/**/node_modules/*/node_modules/**",
      "**/node_modules/.pnpm/**/node_modules/@*/*/node_modules/**",
    ],
  };
  let identity = null;
  try {
    identity = {
      mobile: sourceIdentity(root),
      parent: sourceIdentity(path.dirname(root), parentInputs),
    };
    const require = createRequire(path.join(root, "package.json"));
    const expoRequire = createRequire(require.resolve("expo/package.json"));
    const expo = require("expo/package.json");
    const tool = expoRequire("@expo/fingerprint");
    const toolPackage = expoRequire("@expo/fingerprint/package.json");
    const normalized = await expoRequire("@expo/fingerprint/build/Options").normalizeOptionsAsync(
      root,
      settings,
    );
    const extraSources = [
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "modules",
      "vendor/patches",
      "../public/brand",
    ]
      .filter((name) => fs.existsSync(path.resolve(root, name)))
      .map((filePath) => ({
        type: fs.statSync(path.resolve(root, filePath)).isDirectory() ? "dir" : "file",
        filePath,
        reasons: ["Explicit native configuration/plugins/patches/assets input"],
      }));
    const measured = await tool.createFingerprintAsync(root, { ...settings, extraSources });
    const after = {
      mobile: sourceIdentity(root),
      parent: sourceIdentity(path.dirname(root), parentInputs),
    };
    const sourceDrift = JSON.stringify(identity) !== JSON.stringify(after);
    return {
      schemaVersion: 1,
      status: sourceDrift ? "unknown" : "measured",
      environment,
      sourceChangedDuringMeasurement: sourceDrift,
      sourceIdentityAfter: after,
      expoVersion: expo.version,
      tool: { name: "@expo/fingerprint", version: toolPackage.version },
      settings,
      sourceIdentity: identity,
      nativeHash: measured.hash,
      sources: measured.sources.map((source) => ({
        type: source.type,
        id: slash(source.id ?? source.filePath),
        hash: source.hash,
        reasons: source.reasons,
        state: source.hash
          ? "hashed"
          : source.reasons.includes("bareNativeDir") &&
              normalized.useCNGForPlatforms[source.filePath]
            ? "generated-native-excluded"
            : "unknown-excluded",
      })),
      extraSources,
      managedNativeDirectories: normalized.useCNGForPlatforms,
      sharedJavaScript: {
        paths: ["../src", "../packages/core"],
        sourceTreeSha256: identity.parent.treeSha256,
        interpretation:
          "Recorded source provenance; not inserted into native fingerprint solely because JS changed.",
      },
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      status: "unknown",
      environment,
      settings,
      sourceIdentity: identity,
      nativeRebuild: "unknown",
      reason: `Installed Expo fingerprint could not measure native inputs (${error.name}); no fallback compatibility hash is fabricated.`,
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = options(process.argv.slice(2), [], ["--baseline", "--output"]);
  const report = await fingerprint();
  report.comparison = compareNative(
    args["--baseline"] ? readJson(path.resolve(args["--baseline"])) : null,
    report,
  );
  process.stdout.write(writeReport(mobileRoot, args["--output"], report));
}
