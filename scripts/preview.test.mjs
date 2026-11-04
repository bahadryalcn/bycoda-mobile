import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { previewPlan, assertRun, buildResult } from "./preview.mjs";
import { copyPreviewSource } from "./preview-archive.mjs";
import { options, outputPath, sha256 } from "./preview-support.mjs";

const config = JSON.parse(fs.readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
const plan = () => previewPlan({ platform: "android", easVersion: "26.0.0" }, config);
const uuid = "00000000-0000-4000-8000-000000000001";
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bycoda-mobile-preview-"));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(directory).startsWith("bycoda-mobile-preview-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const put = (name, content) => {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const mobileFiles = [
    "package.json",
    "pnpm-lock.yaml",
    "app.json",
    ".env.example",
    "assets/brand/mobile-icon.png",
    "assets/brand/mobile-adaptive-foreground.png",
  ];
  const parentFiles = [
    "src/shared/model/host-contracts/index.ts",
    "packages/core/package.json",
    "public/brand/bycoda/mark-white.png",
    "public/brand/bycoda/logo-horizontal-white.png",
    "public/brand/bycoda/favicon-32.png",
  ];
  for (const name of mobileFiles)
    put(`mobile/${name}`, name === "app.json" ? '{"expo":{"extra":{"keep":true}}}' : "test-source");
  for (const name of parentFiles) put(name, "parent-source");
  return {
    directory,
    put,
    mobileFiles,
    parentFiles,
    mobile: path.join(directory, "mobile"),
    parent: directory,
    destination: path.join(directory, "staged"),
    projectId: uuid,
    identities: { mobile: { gitSha: "a".repeat(40) }, parent: { gitSha: "b".repeat(40) } },
  };
}

test("production profiles produce one internal APK or iOS simulator request; plan has no remote authority", () => {
  assert.equal(plan().status, "plan-only");
  assert.equal(plan().maxRemoteBuildRequests, 1);
  assert(plan().command.includes("--no-wait"));
  assert(plan().command.includes("--freeze-credentials"));
  assert.equal(
    previewPlan({ platform: "ios-simulator", wait: true }, config).profile,
    "preview-simulator",
  );
  for (const platform of ["production", "all", "ios"])
    assert.throws(() => previewPlan({ platform }, config));
  assert.throws(() => previewPlan({ easVersion: "latest;echo injected" }, config));
});
test("rejects changed distribution, OTA channels and implicit submission", () => {
  for (const edit of [
    { distribution: "store" },
    { channel: "production" },
    { autoIncrement: true },
  ])
    assert.throws(() =>
      previewPlan(
        {},
        { ...config, build: { ...config.build, preview: { ...config.build.preview, ...edit } } },
      ),
    );
  assert.throws(() => previewPlan({}, { ...config, submit: { preview: {} } }));
});
test("remote guard rejects missing authorization, credentials, exact version, project and dirty sources", () => {
  const args = { "--allow-remote-build": true, "--project-id": uuid };
  const identities = { mobile: { dirty: false }, parent: { dirty: false } };
  assert.doesNotThrow(() =>
    assertRun(plan(), args, { EXPO_TOKEN: "synthetic-not-a-secret" }, identities),
  );
  assert.throws(() => assertRun(plan(), {}, {}, identities), /allow-remote/);
  assert.throws(() => assertRun(plan(), args, {}, identities), /EXPO_TOKEN/);
  assert.throws(() =>
    assertRun({ ...plan(), easVersion: null }, args, { EXPO_TOKEN: "synthetic" }, identities),
  );
  assert.throws(() =>
    assertRun(plan(), { "--allow-remote-build": true }, { EXPO_TOKEN: "synthetic" }, identities),
  );
  assert.throws(() =>
    assertRun(
      plan(),
      args,
      { EXPO_TOKEN: "synthetic" },
      { mobile: { dirty: true }, parent: { dirty: false } },
    ),
  );
});
test("pending and finished EAS metadata never claim a downloaded, installed or published artifact", () => {
  const pending = buildResult(
    [
      {
        id: uuid,
        platform: "ANDROID",
        buildProfile: "preview",
        distribution: "INTERNAL",
        status: "IN_QUEUE",
      },
    ],
    plan(),
  );
  assert.equal(pending.status, "pending");
  const simulator = previewPlan({ platform: "ios-simulator" }, config);
  assert.equal(
    buildResult(
      {
        id: uuid,
        platform: "IOS",
        buildProfile: "preview-simulator",
        distribution: "SIMULATOR",
        status: "IN_QUEUE",
      },
      simulator,
    ).status,
    "pending",
  );
  const finished = buildResult(
    [
      {
        id: uuid,
        platform: "ANDROID",
        buildProfile: "preview",
        status: "FINISHED",
        artifacts: { buildUrl: "https://example.invalid/synthetic.apk" },
      },
    ],
    plan(),
  );
  assert.equal(finished.status, "build-finished-artifact-unverified");
  assert.equal(finished.artifactDownloaded, false);
  assert.equal(finished.installed, false);
  assert.equal(finished.publishedToStore, false);
  for (const value of [
    [],
    [{ id: uuid, platform: "IOS", status: "FINISHED" }],
    [{ id: uuid, platform: "ANDROID", status: "UNKNOWN" }],
  ])
    assert.throws(() => buildResult(value, plan()));
});
test("isolated archive contains exact parent/mobile bytes, injected existing project identity and no borrowed dependencies", (t) => {
  const value = fixture(t);
  value.mobileFiles.push("removed-source.ts");
  const receipt = copyPreviewSource(value);
  assert.equal(
    fs.readFileSync(
      path.join(value.destination, "src/shared/model/host-contracts/index.ts"),
      "utf8",
    ),
    "parent-source",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(value.destination, "mobile/app.json"), "utf8")).expo.extra
      .eas.projectId,
    uuid,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(value.destination, "mobile/app.json"), "utf8")).expo.extra
      .bycodaPreviewSource.archiveSha256,
    receipt.sourceSha256,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(value.mobile, "app.json"), "utf8")).expo.extra.eas,
    undefined,
  );
  assert.equal(
    receipt.files.find((entry) => entry.path === "mobile/package.json").sha256,
    sha256("test-source"),
  );
  assert(!receipt.files.some((entry) => /node_modules|\.env/.test(entry.path)));
  assert(!fs.existsSync(path.join(value.destination, "mobile/removed-source.ts")));
  assert.throws(() => copyPreviewSource(value), /must not exist/);
});
test("incomplete and escaping archive inputs fail rather than producing a usable preview", (t) => {
  const value = fixture(t);
  assert.throws(() => copyPreviewSource({ ...value, parentFiles: ["../outside"] }), /Unexpected/);
  assert.throws(
    () =>
      copyPreviewSource({
        ...value,
        destination: path.join(value.directory, "other"),
        parentFiles: [],
      }),
    /Missing required/,
  );
});

for (const name of ["mark-white.png", "logo-horizontal-white.png", "favicon-32.png"])
  test(`preview refuses missing runtime brand asset ${name}`, (t) => {
    const value = fixture(t);
    const missing = `public/brand/bycoda/${name}`;
    assert.throws(
      () => copyPreviewSource({ ...value, parentFiles: value.parentFiles.filter((entry) => entry !== missing) }),
      (error) => error.message === `Missing required staged input ${missing}`,
    );
  });
test("CLI and output validators reject arbitrary switches, traversal and link escapes", (t) => {
  assert.throws(() => options(["--profile", "production"], [], ["--platform"]));
  assert.throws(() => options(["--run", "--run"], ["--run"]));
  const value = fixture(t);
  assert.throws(() => outputPath(value.directory, "../escape.json"));
  assert.throws(() => outputPath(value.directory, "temp/verification/../outside.json"));
  assert(outputPath(value.directory, "temp/verification/receipt.json").endsWith("receipt.json"));
});
