import fs from "node:fs";
import path from "node:path";
import { sourceFiles, sourceIdentity, outputPath, sha256, within } from "./preview-support.mjs";
import { parentInputs } from "./native-fingerprint.mjs";

export function copyPreviewSource({
  mobile,
  parent,
  destination,
  projectId,
  mobileFiles = sourceFiles(mobile),
  parentFiles = sourceFiles(parent, parentInputs),
  identities = { mobile: sourceIdentity(mobile), parent: sourceIdentity(parent, parentInputs) },
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId ?? ""))
    throw new Error("An explicit existing Expo project UUID is required; no project is created");
  if (fs.existsSync(destination)) throw new Error("Preview source destination must not exist");
  if (
    ["app.config.js", "app.config.ts", "app.config.mjs", "app.config.cjs"].some((name) =>
      mobileFiles.includes(name),
    )
  )
    throw new Error(
      "Dynamic Expo config requires a reviewed staging adapter; static projectId injection is unsafe",
    );
  const entries = [];
  const copy = (base, name, prefix) => {
    const source = path.resolve(base, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (/(^|\/)\.env\.example$/.test(relative)) return;
    if (!within(base, source) || /(^|\/)(node_modules|\.git|temp|\.env[^/]*)(\/|$)/.test(relative))
      throw new Error("Preview archive refuses private/generated/outside source");
    const stat = fs.lstatSync(source, { throwIfNoEntry: false });
    // Git lists tracked deletions too. Preserve their absence; required inputs and
    // the before/after source identities still reject missing essentials or races.
    if (!stat) return;
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Preview archive requires materialized regular source files");
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = fs.readFileSync(source);
    fs.writeFileSync(target, bytes);
    entries.push({ path: relative, sha256: sha256(bytes) });
  };
  for (const name of mobileFiles) copy(mobile, name, "mobile");
  for (const name of parentFiles) {
    if (!parentInputs.some((prefix) => name === prefix || name.startsWith(`${prefix}/`)))
      throw new Error("Unexpected parent preview input");
    copy(parent, name, "");
  }
  for (const name of [
    "mobile/package.json",
    "mobile/pnpm-lock.yaml",
    "mobile/app.json",
    "packages/core/package.json",
    "mobile/assets/brand/mobile-icon.png",
    "mobile/assets/brand/mobile-adaptive-foreground.png",
    "src/shared/model/host-contracts/index.ts",
  ])
    if (!fs.existsSync(path.join(destination, name)))
      throw new Error(`Missing required staged input ${name}`);
  const appFile = path.join(destination, "mobile/app.json");
  const app = JSON.parse(fs.readFileSync(appFile, "utf8"));
  app.expo.extra = { ...app.expo.extra, eas: { ...app.expo.extra?.eas, projectId } };
  fs.writeFileSync(appFile, JSON.stringify(app, null, 2) + "\n");
  entries.find((entry) => entry.path === "mobile/app.json").sha256 = sha256(
    fs.readFileSync(appFile),
  );
  const ignores =
    "**/node_modules/**\n**/.git/**\n**/temp/**\n**/.env*\n**/*.keystore\n**/*.jks\n**/*.p8\n**/*.p12\n**/*.pem\n**/*.key\n";
  fs.writeFileSync(path.join(destination, ".easignore"), ignores);
  entries.push({ path: ".easignore", sha256: sha256(ignores) });
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const sourceSha256 = sha256(JSON.stringify(entries));
  app.expo.extra.bycodaPreviewSource = {
    mobileSha: identities.mobile.gitSha,
    parentSha: identities.parent.gitSha,
    archiveSha256: sourceSha256,
  };
  fs.writeFileSync(appFile, JSON.stringify(app, null, 2) + "\n");
  entries.find((entry) => entry.path === "mobile/app.json").sha256 = sha256(
    fs.readFileSync(appFile),
  );
  const receipt = {
    schemaVersion: 1,
    kind: "isolated-internal-preview-source",
    sourceIdentity: identities,
    transforms: [
      "Injected the explicitly supplied existing Expo projectId into staged mobile/app.json only",
      "Embedded bycodaPreviewSource into the staged Expo public config for binary source-stamp inspection",
      "Added archive-only excludes; no maintained config, credentials, root manifest or node_modules copied",
    ],
    files: entries,
    sourceSha256,
    sourceFingerprintMethod:
      "SHA-256 of ordered pre-stamp input file hashes; generated stamp/receipt excluded to avoid self-reference",
    stampedArchiveSha256: sha256(JSON.stringify(entries)),
    projectDirectory: "mobile",
    archiveDirectory: ".",
    inclusion:
      "Prepared source bytes; binary source stamp and installed artifact bytes require separate showcase verification.",
  };
  fs.writeFileSync(
    path.join(destination, "preview-source.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  return receipt;
}

export function stagePreview(root, relative, projectId) {
  const parent = path.dirname(root);
  const before = { mobile: sourceIdentity(root), parent: sourceIdentity(parent, parentInputs) };
  const destination = outputPath(root, relative, "build");
  const receipt = copyPreviewSource({
    mobile: root,
    parent,
    destination,
    projectId,
    identities: before,
  });
  const after = { mobile: sourceIdentity(root), parent: sourceIdentity(parent, parentInputs) };
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Source changed while staging; staged bytes cannot be submitted");
  return { destination, receipt };
}
