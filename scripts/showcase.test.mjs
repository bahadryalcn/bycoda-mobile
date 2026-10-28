import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { artifactHash, sha256 } from "./preview-support.mjs";
import {
  captureAndroid,
  captureIos,
  showcase,
  validateShowcase,
  pngViewport,
} from "./showcase.mjs";
import { verifyArtifactSource } from "./showcase-artifact.mjs";
import { spawnSync } from "node:child_process";

const apk = Buffer.from("sanitized synthetic APK fixture; never an installed app");
const png = () => {
  const image = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(image);
  image.write("IHDR", 12);
  image.writeUInt32BE(390, 16);
  image.writeUInt32BE(844, 20);
  return image;
};
const source = {
  mobileSha: "a".repeat(40),
  parentSha: "b".repeat(40),
  archiveSha256: "c".repeat(64),
};
const request = () => ({
  schemaVersion: 1,
  platform: "android",
  deviceId: "emulator-5554",
  allowExistingVirtualDevice: true,
  packageId: "com.bycoda.mobile",
  artifact: { path: "preview.apk", sha256: sha256(apk), source: { ...source } },
  expectedSource: { ...source },
  theme: "dark",
  viewport: { width: 390, height: 844 },
  evidenceKind: "fixture",
  output: "temp/verification/showcase/run",
});
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bycoda-showcase-"));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(directory).startsWith("bycoda-showcase-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
function android(overrides = {}, calls = []) {
  return (command, args) => {
    calls.push([command, ...args]);
    if (["python", "python3"].includes(command))
      return Buffer.from(
        JSON.stringify({
          extra: { bycodaPreviewSource: source },
          android: { package: "com.bycoda.mobile" },
        }),
      );
    const key = args.join(" ");
    if (args[0] === "devices")
      return Buffer.from(
        overrides.devices ??
          "List of devices attached\nemulator-5554 device product:sdk_gphone64\n",
      );
    if (key.includes("ro.kernel.qemu")) return Buffer.from(overrides.qemu ?? "1");
    if (key.includes("dumpsys"))
      return Buffer.from(
        overrides.foreground ??
          "mResumedActivity: ActivityRecord{demo u0 com.bycoda.mobile/.MainActivity t1}",
      );
    if (key.includes("pm path")) return Buffer.from("package:/data/app/demo/base.apk");
    if (key.includes("exec-out cat")) return overrides.installed ?? apk;
    if (key.includes("uimode")) return Buffer.from(overrides.theme ?? "Night mode: yes");
    if (key.includes("screencap")) return png();
    throw new Error(`Unexpected fixture command ${key}`);
  };
}

test("request rejects physical/implicit devices, fabricated source association and incomplete metadata", () => {
  assert.doesNotThrow(() => validateShowcase(request()));
  for (const edit of [
    { deviceId: "physical-usb-id" },
    { allowExistingVirtualDevice: false },
    { theme: "auto" },
    { expectedSource: { ...source, mobileSha: "d".repeat(40) } },
    { packageId: "com.bycoda.mobile;echo injected" },
  ])
    assert.throws(() => validateShowcase({ ...request(), ...edit }));
});
test("reads an actual ZIP public Expo config and rejects unstamped/mismatched binary source", (t) => {
  const directory = temporary(t);
  const file = path.join(directory, "preview.apk");
  const python = process.platform === "win32" ? "python" : "python3";
  const script =
    "import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z: z.writestr('assets/app.config',sys.argv[2])";
  const config = {
    extra: { bycodaPreviewSource: source },
    android: { package: "com.bycoda.mobile" },
  };
  const made = spawnSync(python, ["-c", script, file, JSON.stringify(config)], {
    windowsHide: true,
  });
  if (made.error?.code === "ENOENT")
    return t.skip(
      "Python stdlib ZIP reader unavailable; native artifact inspection remains unverified",
    );
  assert.equal(made.status, 0);
  const run = (command, args) => {
    const result = spawnSync(command, args, { windowsHide: true });
    assert.equal(result.status, 0);
    return result.stdout;
  };
  assert.deepEqual(
    verifyArtifactSource(file, "android", source, "com.bycoda.mobile", run).stamp,
    source,
  );
  assert.throws(
    () =>
      verifyArtifactSource(
        file,
        "android",
        { ...source, parentSha: "f".repeat(40) },
        "com.bycoda.mobile",
        run,
      ),
    /matching/,
  );
  assert.throws(() => verifyArtifactSource(file, "android", source, "com.other", run), /package/);
});
test("Android validates foreground/theme/emulator and exact installed bytes before and after screenshot", () => {
  const calls = [];
  const result = captureAndroid(request(), android({}, calls));
  assert.deepEqual(pngViewport(result.screenshot), { width: 390, height: 844 });
  assert.equal(calls.filter((call) => call.includes("activities")).length, 2);
  assert.equal(calls.filter((call) => call.includes("cat")).length, 2);
  assert(
    !calls.some((call) =>
      call.some((arg) => ["install", "uninstall", "am", "input", "settings"].includes(arg)),
    ),
  );
});
test("wrong foreground, offline/physical devices, theme mismatch and different installed APK fail closed", () => {
  for (const override of [
    { foreground: "mResumedActivity: ActivityRecord{demo u0 com.other/.Main t1}" },
    { devices: "emulator-5554 offline" },
    { qemu: "0" },
    { theme: "Night mode: auto" },
    { installed: Buffer.from("different") },
  ]) {
    const calls = [];
    assert.throws(() => captureAndroid(request(), android(override, calls)));
    assert(!calls.some((call) => call.includes("screencap")));
  }
});
test("successful fixture receipt records actual pixel dimensions and never claims feature/device acceptance", (t) => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, "preview.apk"), apk);
  const report = showcase(request(), { mobile: directory, run: android() });
  assert.equal(report.evidenceKind, "fixture");
  assert.equal(report.physicalDevice, false);
  assert.equal(report.artifactSha256, sha256(apk));
  assert.equal(report.screenshotSha256, sha256(png()));
  assert(fs.existsSync(path.join(directory, request().output, "capture.png")));
  assert.throws(() => showcase(request(), { mobile: directory, run: android() }), /must be new/);
});
test("wrong supplied artifact and viewport cannot produce a passing capture receipt", (t) => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, "preview.apk"), apk);
  assert.throws(() =>
    showcase(
      { ...request(), artifact: { ...request().artifact, sha256: "f".repeat(64) } },
      { mobile: directory, run: android() },
    ),
  );
  assert.throws(
    () =>
      showcase(
        { ...request(), viewport: { width: 400, height: 800 } },
        { mobile: directory, run: android() },
      ),
    /viewport/,
  );
  const failed = JSON.parse(
    fs.readFileSync(path.join(directory, request().output, "failure.json"), "utf8"),
  );
  assert.equal(failed.captured, false);
  assert(!fs.existsSync(path.join(directory, request().output, "capture.png")));
});
test("iOS uses a nonce-bound XCTest foreground screenshot and rejects a failing probe", (t) => {
  const directory = temporary(t);
  const app = path.join(directory, "preview.app");
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, "binary"), "synthetic simulator binary");
  const probe = path.join(directory, "probe");
  fs.mkdirSync(path.join(probe, "Documents"), { recursive: true });
  const ios = {
    ...request(),
    platform: "ios",
    deviceId: "00000000-0000-4000-8000-000000000001",
    artifact: { path: app, sha256: artifactHash(app), source: { ...source } },
  };
  let fail = false;
  const run = (command, args) => {
    if (command === "xcodebuild") {
      if (fail) throw new Error("Foreground XCTest failed");
      const code = fs.readFileSync(path.join(directory, "ForegroundTests.swift"), "utf8");
      const nonce = /showcase-([a-f0-9]{24})\.png/.exec(code)[1];
      fs.writeFileSync(path.join(probe, "Documents", `showcase-${nonce}.png`), png());
      return Buffer.from("synthetic XCTest success");
    }
    if (args.includes("list"))
      return Buffer.from(
        JSON.stringify({
          devices: { runtime: [{ udid: ios.deviceId, state: "Booted", isAvailable: true }] },
        }),
      );
    if (args.includes("appearance")) return Buffer.from("dark");
    if (args.includes("get_app_container"))
      return Buffer.from(args.includes("com.bycoda.showcaseprobe.xctrunner") ? probe : app);
    throw new Error("Unexpected simulator fixture command");
  };
  assert.deepEqual(pngViewport(captureIos(ios, directory, run).screenshot), ios.viewport);
  fail = true;
  assert.throws(() => captureIos(ios, directory, run), /Foreground XCTest failed/);
});
