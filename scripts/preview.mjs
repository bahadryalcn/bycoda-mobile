/** Default is a local plan. Remote EAS invocation is explicit and bounded to one internal build. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { options, readJson, sourceIdentity, writeReport } from "./preview-support.mjs";
import { stagePreview } from "./preview-archive.mjs";
import { parentInputs } from "./native-fingerprint.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export function previewPlan({ platform = "android", easVersion, wait = false, projectId }, config) {
  if (!["android", "ios-simulator"].includes(platform))
    throw new Error("Only internal Android APK and iOS simulator previews are supported");
  if (easVersion && !/^\d+\.\d+\.\d+$/.test(easVersion))
    throw new Error("EAS CLI version must be an exact numeric semver");
  const profile = platform === "android" ? "preview" : "preview-simulator";
  const base = config.build?.preview;
  const specific = config.build?.[profile];
  if (
    base?.distribution !== "internal" ||
    base.autoIncrement !== false ||
    base.developmentClient !== false ||
    base.android?.buildType !== "apk" ||
    (profile === "preview-simulator" &&
      (specific?.extends !== "preview" || specific.ios?.simulator !== true))
  )
    throw new Error("Preview profile must remain internal, non-incrementing APK/simulator source");
  if (base.channel || specific?.channel || config.submit?.[profile])
    throw new Error("Preview cannot silently select an OTA channel or submission profile");
  return {
    schemaVersion: 1,
    status: "plan-only",
    platform,
    profile,
    easVersion: easVersion ?? null,
    projectIdConfigured: !!projectId,
    maxRemoteBuildRequests: 1,
    wait,
    command: [
      "build",
      "--platform",
      platform === "android" ? "android" : "ios",
      "--profile",
      profile,
      "--non-interactive",
      "--freeze-credentials",
      "--json",
      ...(wait ? [] : ["--no-wait"]),
    ],
    authority:
      "Requires --run, --allow-remote-build, EXPO_TOKEN, exact installed CLI version, clean parent/mobile source and an existing Expo project UUID. No store submission, OTA update or artifact installation.",
  };
}

export function buildResult(value, plan) {
  const records = Array.isArray(value) ? value : [value];
  if (records.length !== 1 || !records[0] || typeof records[0].id !== "string")
    throw new Error("Expected exactly one EAS build record");
  const build = records[0];
  const platform = plan.platform === "android" ? "ANDROID" : "IOS";
  const distribution = plan.platform === "ios-simulator" ? "SIMULATOR" : "INTERNAL";
  if (
    build.platform !== platform ||
    (build.buildProfile && build.buildProfile !== plan.profile) ||
    (build.distribution && build.distribution !== distribution)
  )
    throw new Error("EAS result does not match the requested internal platform/profile");
  const pending = ["NEW", "IN_QUEUE", "IN_PROGRESS", "PENDING_CANCEL"].includes(build.status);
  const failed = ["ERRORED", "CANCELED"].includes(build.status);
  if (!pending && !failed && build.status !== "FINISHED")
    throw new Error("Unknown EAS build state; completion is unverified");
  return {
    id: build.id,
    platform: build.platform,
    remoteStatus: build.status,
    status: pending ? "pending" : failed ? "failed" : "build-finished-artifact-unverified",
    remoteGitSha: build.gitCommitHash ?? null,
    artifactUrlPresent: !!build.artifacts?.buildUrl,
    artifactDownloaded: false,
    installed: false,
    publishedToStore: false,
    otaPublished: false,
  };
}

export function assertRun(plan, args, env, identities) {
  if (!args["--allow-remote-build"]) throw new Error("Remote build requires --allow-remote-build");
  if (!env.EXPO_TOKEN) throw new Error("EXPO_TOKEN is missing; no remote request was made");
  if (!plan.easVersion) throw new Error("An exact owner-selected --eas-version is required");
  if (!args["--project-id"])
    throw new Error("Supply an existing --project-id; project creation is not authorized");
  if (identities.mobile.dirty || identities.parent.dirty)
    throw new Error(
      "Remote preview requires exact clean parent/mobile source; local dirty work is never reset or uploaded",
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = options(
    process.argv.slice(2),
    ["--run", "--allow-remote-build", "--wait"],
    ["--platform", "--eas-version", "--project-id", "--stage", "--output"],
  );
  const plan = previewPlan(
    {
      platform: args["--platform"],
      easVersion: args["--eas-version"],
      wait: !!args["--wait"],
      projectId: args["--project-id"],
    },
    readJson(path.join(root, "eas.json")),
  );
  plan.sourceIdentity = {
    mobile: sourceIdentity(root),
    parent: sourceIdentity(path.dirname(root), parentInputs),
  };
  if (args["--run"]) {
    assertRun(plan, args, process.env, plan.sourceIdentity);
    const version = spawnSync("eas", ["--version"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      shell: false,
    });
    if (version.status !== 0 || !version.stdout.includes(`eas-cli/${plan.easVersion} `))
      throw new Error(
        "The exact preinstalled EAS CLI is unavailable; this helper never installs it",
      );
    const staged = stagePreview(
      root,
      args["--stage"] ?? `temp/build/mobile-preview/${Date.now()}-${process.pid}`,
      args["--project-id"],
    );
    const result = spawnSync("eas", plan.command, {
      cwd: path.join(staged.destination, "mobile"),
      env: { ...process.env, EAS_NO_VCS: "1", EAS_PROJECT_ROOT: staged.destination },
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 4 * 1024 * 1024,
      timeout: plan.wait ? 3_600_000 : 180_000,
    });
    // Keep build logs local; do not print credential-bearing environment or build URLs.
    fs.writeFileSync(path.join(staged.destination, "eas-build.stderr.log"), result.stderr ?? "");
    plan.archive = {
      sourceSha256: staged.receipt.sourceSha256,
      sourceIdentity: staged.receipt.sourceIdentity,
      fileCount: staged.receipt.files.length,
    };
    if (result.error || result.status !== 0) {
      plan.status = "submission-failed-or-uncertain";
      plan.remoteOutcome = "unknown; inspect the EAS dashboard before retrying";
      process.exitCode = 1;
    } else {
      plan.build = buildResult(JSON.parse(result.stdout), plan);
      plan.status = plan.build.status;
      if (plan.status === "failed") process.exitCode = 1;
    }
  }
  process.stdout.write(writeReport(root, args["--output"], plan));
}
