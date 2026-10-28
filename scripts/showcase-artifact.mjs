/** Read the public Expo Constants config produced by the installed SDK; never infer source from a version. */
import fs from "node:fs";
import path from "node:path";

export function verifyArtifactSource(file, platform, expected, packageId, run) {
  let config;
  if (platform === "android") {
    // Python's standard ZIP reader is available on the diagnostic/CI hosts; no npm ZIP dependency is added.
    const script =
      "import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n i=z.getinfo('assets/app.config')\n if i.file_size>4194304: raise ValueError('Public Expo config exceeds 4 MiB')\n print(z.read(i).decode('utf-8'))";
    config = JSON.parse(
      run(process.platform === "win32" ? "python" : "python3", ["-c", script, file]).toString(
        "utf8",
      ),
    );
  } else {
    const configPath = path.join(file, "EXConstants.bundle", "app.config");
    if (fs.statSync(configPath).size > 4 * 1024 * 1024)
      throw new Error("Public Expo config exceeds 4 MiB");
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  const stamp = config.extra?.bycodaPreviewSource;
  if (
    !stamp ||
    JSON.stringify(Object.entries(stamp).sort()) !== JSON.stringify(Object.entries(expected).sort())
  )
    throw new Error(
      "Artifact has no matching embedded preview source stamp; source inclusion is unknown",
    );
  if (
    (platform === "android" ? config.android?.package : config.ios?.bundleIdentifier) !== packageId
  )
    throw new Error("Embedded artifact package identity differs from the selected package");
  return {
    stamp,
    proof:
      "Exact expected parent/mobile/pre-stamp input digest read from the artifact's Expo Constants app.config; not inferred from app version",
  };
}
