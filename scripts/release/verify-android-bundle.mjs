import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";

const pageSize = 16_384n;
const nativeLibrary = /^[^/]+\/lib\/(arm64-v8a|x86_64)\/[^/]+\.so$/;
const app = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8")).expo;

export function hasAlignedLoadSegments(bytes) {
  const elf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (elf.length < 64 || elf.readUInt32BE(0) !== 0x7f454c46 || elf[4] !== 2 || elf[5] !== 1) {
    return false;
  }

  const tableOffset = elf.readBigUInt64LE(32);
  const entrySize = elf.readUInt16LE(54);
  const entryCount = elf.readUInt16LE(56);
  if (entrySize < 56 || tableOffset + BigInt(entrySize * entryCount) > BigInt(elf.length)) {
    return false;
  }

  let hasLoadSegment = false;
  for (let entry = 0; entry < entryCount; entry++) {
    const offset = Number(tableOffset) + entry * entrySize;
    if (elf.readUInt32LE(offset) !== 1) continue;
    hasLoadSegment = true;
    const alignment = elf.readBigUInt64LE(offset + 48);
    const fileOffset = elf.readBigUInt64LE(offset + 8);
    const address = elf.readBigUInt64LE(offset + 16);
    if (
      alignment % pageSize !== 0n ||
      alignment < pageSize ||
      (fileOffset - address) % pageSize !== 0n
    ) {
      return false;
    }
  }
  return hasLoadSegment;
}

function verify(bundle, bundletool) {
  const bundleFlag = `--bundle=${bundle}`;
  const run = (...args) =>
    execFileSync("java", ["-jar", bundletool, ...args, bundleFlag], {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    }).trim();
  const manifest = (xpath) => run("dump", "manifest", `--xpath=${xpath}`);

  run("validate");
  const packageName = manifest("/manifest/@package");
  const versionCode = manifest("/manifest/@android:versionCode");
  const targetSdk = Number(manifest("/manifest/uses-sdk/@android:targetSdkVersion"));
  if (packageName !== app.android.package || versionCode !== String(app.android.versionCode)) {
    throw new Error(
      `Bundle identity differs from app.json: ${packageName} versionCode ${versionCode}.`,
    );
  }
  if (!Number.isInteger(targetSdk) || targetSdk < 36) {
    throw new Error(`Google Play requires target SDK 36 or higher. Bundle target: ${targetSdk}.`);
  }
  const permissions = [
    ...run("dump", "manifest").matchAll(
      /<uses-permission(?:-sdk-\d+)?\s[^>]*\bandroid:name="([^"]+)"/g,
    ),
  ].map(([, name]) => name);
  if (!permissions.includes("android.permission.INTERNET")) {
    throw new Error("Could not verify the Bycoda manifest permissions.");
  }
  const blocked = permissions.filter((name) => app.android.blockedPermissions.includes(name));
  if (blocked.length) {
    throw new Error(`Blocked Android permissions in the bundle: ${blocked.join(", ")}.`);
  }
  if (!/\bPAGE_ALIGNMENT_16K\b/.test(run("dump", "config"))) {
    throw new Error("The bundle does not request 16 KB page alignment for generated APKs.");
  }

  const libraries = Object.entries(
    unzipSync(readFileSync(bundle), {
      filter: ({ name }) => nativeLibrary.test(name),
    }),
  );
  if (!libraries.some(([name]) => name.includes("/lib/arm64-v8a/"))) {
    throw new Error("The Bycoda bundle has no arm64-v8a native libraries.");
  }
  const unaligned = libraries.filter(([, contents]) => !hasAlignedLoadSegments(contents));
  if (unaligned.length) {
    throw new Error(
      `Native libraries with incompatible alignment:\n${unaligned.map(([name]) => name).join("\n")}`,
    );
  }
  console.log(
    `${packageName} versionCode ${versionCode}, API ${targetSdk}, ${libraries.length} 64-bit libraries aligned at 16 KB.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [bundle, bundletool] = process.argv.slice(2);
  if (!bundle || !bundletool) {
    throw new Error("Usage: pnpm store:verify-android <release.aab> <bundletool.jar>");
  }
  verify(bundle, bundletool);
}
