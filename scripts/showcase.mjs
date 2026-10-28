import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { options, readJson, artifactHash, sha256, outputPath, within } from "./preview-support.mjs";
import { writeForegroundProbe } from "./showcase-ios.mjs";
import { verifyArtifactSource } from "./showcase-artifact.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (value, length) =>
  typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export function validateShowcase(request) {
  if (
    request.schemaVersion !== 1 ||
    !["android", "ios"].includes(request.platform) ||
    request.allowExistingVirtualDevice !== true
  )
    throw new Error("Explicit owned/selected virtual-device request required");
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(request.packageId ?? ""))
    throw new Error("Invalid package identity");
  if (
    request.platform === "android"
      ? !/^emulator-\d{4,6}$/.test(request.deviceId ?? "")
      : !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request.deviceId ?? "")
  )
    throw new Error("Only an explicit Android emulator or iOS simulator identifier is accepted");
  if (
    !["light", "dark"].includes(request.theme) ||
    !["fixture", "native-screen"].includes(request.evidenceKind) ||
    ![request.viewport?.width, request.viewport?.height].every(
      (number) => Number.isSafeInteger(number) && number > 0 && number <= 8192,
    )
  )
    throw new Error("Explicit theme, pixel viewport and evidence kind are required");
  if (
    !digest(request.artifact?.sha256, 64) ||
    typeof request.artifact.path !== "string" ||
    !(request.platform === "android"
      ? request.artifact.path.endsWith(".apk")
      : request.artifact.path.endsWith(".app"))
  )
    throw new Error("An exact preview APK or materialized simulator .app with SHA-256 is required");
  for (const source of [request.artifact.source, request.expectedSource])
    if (
      !source ||
      !digest(source.mobileSha, 40) ||
      !digest(source.parentSha, 40) ||
      !digest(source.archiveSha256, 64) ||
      Object.keys(source).sort().join(",") !== "archiveSha256,mobileSha,parentSha"
    )
      throw new Error("Exact parent/mobile/archive source identities are required");
  if (
    JSON.stringify(Object.entries(request.artifact.source).sort()) !==
    JSON.stringify(Object.entries(request.expectedSource).sort())
  )
    throw new Error("Preview artifact source identity differs from the requested source");
  return request;
}

export function pngViewport(bytes) {
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.subarray(12, 16).toString() !== "IHDR"
  )
    throw new Error("Capture did not return a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function execute(command, args) {
  const result = spawnSync(command, args, {
    shell: false,
    windowsHide: true,
    maxBuffer: 512 * 1024 * 1024,
    timeout: command === "xcodebuild" ? 300_000 : 30_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed; no showcase acceptance is recorded`);
  return Buffer.from(result.stdout ?? "");
}

export function captureAndroid(request, run = execute) {
  const adb = (...args) => run("adb", ["-s", request.deviceId, ...args]);
  const text = (...args) => adb(...args).toString("utf8");
  const device = () => {
    const devices = run("adb", ["devices", "-l"]).toString("utf8");
    if (
      !devices
        .split(/\r?\n/)
        .some(
          (line) => line.split(/\s+/)[0] === request.deviceId && line.split(/\s+/)[1] === "device",
        ) ||
      text("shell", "getprop", "ro.kernel.qemu").trim() !== "1"
    )
      throw new Error("Selected device is not a freshly verified online emulator");
  };
  const foreground = () => {
    const value = text("shell", "dumpsys", "activity", "activities");
    const current = value
      .split(/\r?\n/)
      .filter((line) => /mResumedActivity|topResumedActivity/.test(line));
    if (!current.length || !current.every((line) => line.includes(` ${request.packageId}/`)))
      throw new Error("Expected package is not the current foreground activity");
  };
  const installed = () => {
    const paths = text("shell", "pm", "path", request.packageId).trim().split(/\r?\n/);
    if (
      paths.length !== 1 ||
      !/^package:\/data\/app\/[A-Za-z0-9_+./=~-]+\/base\.apk$/.test(paths[0])
    )
      throw new Error(
        "Exact single installed base APK is unavailable; split or unknown packages cannot be inferred equivalent",
      );
    if (
      sha256(adb("exec-out", "cat", paths[0].slice("package:".length))) !== request.artifact.sha256
    )
      throw new Error("Installed APK bytes do not match the explicitly supplied preview artifact");
  };
  device();
  installed();
  foreground();
  const mode = text("shell", "cmd", "uimode", "night").trim();
  if (!(request.theme === "dark" ? /Night mode: yes\b/i : /Night mode: no\b/i).test(mode))
    throw new Error("Current emulator theme is different or unknown; helper does not change it");
  const screenshot = adb("exec-out", "screencap", "-p");
  foreground();
  device();
  installed();
  return {
    screenshot,
    foregroundProof: "Fresh Android resumed activity checks before and after capture",
    themeProof: mode,
  };
}

export function captureIos(request, directory, run = execute, read = fs.readFileSync) {
  const text = (...args) =>
    run("xcrun", ["simctl", ...args])
      .toString("utf8")
      .trim();
  const booted = () => {
    const devices = JSON.parse(text("list", "devices", "booted", "--json"));
    if (
      !Object.values(devices.devices ?? {})
        .flat()
        .some(
          (device) =>
            device.udid.toLowerCase() === request.deviceId.toLowerCase() &&
            device.state === "Booted" &&
            device.isAvailable === true,
        )
    )
      throw new Error("Selected simulator is not freshly verified booted/available");
  };
  booted();
  const container = text("get_app_container", request.deviceId, request.packageId, "app");
  if (
    !path.isAbsolute(container) ||
    !container.endsWith(".app") ||
    artifactHash(container) !== request.artifact.sha256
  )
    throw new Error("Installed simulator app differs from supplied preview bytes");
  const mode = text("ui", request.deviceId, "appearance").toLowerCase();
  if (mode !== request.theme)
    throw new Error("Simulator appearance is different or unknown; no theme is changed");
  const nonce = randomBytes(12).toString("hex");
  const project = writeForegroundProbe(directory, request.packageId, nonce);
  run("xcodebuild", [
    "test",
    "-project",
    project,
    "-scheme",
    "ShowcaseProbe",
    "-destination",
    `id=${request.deviceId}`,
    "-derivedDataPath",
    path.join(directory, "derived-data"),
    "-resultBundlePath",
    path.join(directory, "foreground.xcresult"),
    "-only-testing:ShowcaseProbe/ForegroundTests/testAlreadyForeground",
    "CODE_SIGNING_ALLOWED=NO",
  ]);
  const probe = text(
    "get_app_container",
    request.deviceId,
    "com.bycoda.showcaseprobe.xctrunner",
    "data",
  );
  const screenshotPath = path.join(probe, "Documents", `showcase-${nonce}.png`);
  if (!path.isAbsolute(probe) || !within(probe, screenshotPath))
    throw new Error("Probe returned an invalid container");
  const screenshot = read(screenshotPath);
  booted();
  if (
    artifactHash(text("get_app_container", request.deviceId, request.packageId, "app")) !==
    request.artifact.sha256
  )
    throw new Error("Installed simulator artifact changed during capture");
  return {
    screenshot,
    foregroundProof:
      "XCTest XCUIApplication.state == runningForeground before and after app screenshot; no target launch/activate",
    themeProof: mode,
  };
}

export function showcase(request, { mobile = root, run = execute } = {}) {
  validateShowcase(request);
  const artifact = path.resolve(mobile, request.artifact.path);
  if (artifactHash(artifact) !== request.artifact.sha256)
    throw new Error("Supplied artifact SHA-256 does not match its bytes");
  const sourceProof = verifyArtifactSource(
    artifact,
    request.platform,
    request.expectedSource,
    request.packageId,
    run,
  );
  const directory = outputPath(mobile, request.output);
  if (fs.existsSync(directory))
    throw new Error("Capture output directory must be new; existing evidence is preserved");
  fs.mkdirSync(directory, { recursive: true });
  try {
    const captured =
      request.platform === "android"
        ? captureAndroid(request, run)
        : captureIos(request, directory, run);
    const viewport = pngViewport(captured.screenshot);
    if (viewport.width !== request.viewport.width || viewport.height !== request.viewport.height)
      throw new Error("Actual capture pixel viewport differs from explicit metadata");
    fs.writeFileSync(path.join(directory, "capture.png"), captured.screenshot);
    const report = {
      schemaVersion: 1,
      status: "captured",
      capturedAt: new Date().toISOString(),
      platform: request.platform,
      deviceId: request.deviceId,
      virtualDevice: true,
      physicalDevice: false,
      packageId: request.packageId,
      artifactSha256: request.artifact.sha256,
      suppliedSourceIdentity: request.artifact.source,
      sourceProof,
      theme: request.theme,
      viewportPixels: viewport,
      evidenceKind: request.evidenceKind,
      screenshotSha256: sha256(captured.screenshot),
      foregroundProof: captured.foregroundProof,
      themeProof: captured.themeProof,
      acceptance:
        "Embedded source stamp, foreground/artifact/capture proof only; not feature, real Host/provider or physical-device acceptance. Fixture kind remains fixture evidence.",
    };
    fs.writeFileSync(path.join(directory, "capture.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } catch (error) {
    fs.writeFileSync(
      path.join(directory, "failure.json"),
      JSON.stringify(
        { schemaVersion: 1, status: "failed", reason: error.message, captured: false },
        null,
        2,
      ) + "\n",
    );
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = options(process.argv.slice(2), [], ["--request"]);
  const requestFile = args["--request"] ?? process.env.BYCODA_SHOWCASE_REQUEST;
  if (!requestFile)
    throw new Error("Usage: node scripts/showcase.mjs --request <explicit JSON request>");
  process.stdout.write(
    JSON.stringify(showcase(readJson(path.resolve(requestFile))), null, 2) + "\n",
  );
}
