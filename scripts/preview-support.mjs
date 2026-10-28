import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const slash = (value) => value.replaceAll("\\", "/");
export const within = (root, file) => {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

export function options(args, flags = [], values = []) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate option ${key}`);
    if (flags.includes(key)) result[key] = true;
    else if (values.includes(key) && args[index + 1] && !args[index + 1].startsWith("--"))
      result[key] = args[++index];
    else throw new Error(`Unknown or missing option ${key}`);
  }
  return result;
}

export function readJson(file) {
  if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error("JSON input exceeds 8 MiB");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function outputPath(root, relative, category = "verification") {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative))
    throw new Error("Output must be an explicit relative temp path");
  const base = path.resolve(root, "temp", category);
  const target = path.resolve(root, relative);
  if (target === base || !within(base, target))
    throw new Error(`Output must stay under temp/${category}/`);
  for (let current = target; within(root, current); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error("Output cannot traverse a link/junction");
    if (current === root) break;
  }
  return target;
}

export function writeReport(root, relative, report) {
  const text = JSON.stringify(report, null, 2) + "\n";
  if (relative) {
    const file = outputPath(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return text;
}

export function sourceFiles(root, selected = []) {
  const raw = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...selected],
    { cwd: root, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return [...new Set(raw.split("\0").filter(Boolean))].sort();
}

export function sourceIdentity(root, selected = []) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  const entries = sourceFiles(root, selected).map((name) => {
    const file = path.resolve(root, name);
    if (!within(root, file)) throw new Error("Source path escaped its repository");
    if (!fs.existsSync(file)) return [name, "deleted"];
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return [name, `link:${sha256(fs.readlinkSync(file))}`];
    if (!stat.isFile()) throw new Error("Only regular source files are supported");
    return [name, sha256(fs.readFileSync(file))];
  });
  return {
    gitSha: git("rev-parse", "HEAD"),
    dirty: !!git(
      "status",
      "--porcelain",
      "--untracked-files=normal",
      ...(selected.length ? ["--", ...selected] : []),
    ),
    treeSha256: sha256(JSON.stringify(entries)),
    fileCount: entries.length,
    scope: selected.length
      ? selected
      : ["Git tracked and nonignored untracked files; symlink identity only"],
  };
}

export function artifactHash(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error("Artifact cannot be a symlink");
  if (stat.isFile()) return sha256(fs.readFileSync(file));
  if (!stat.isDirectory()) throw new Error("Artifact must be a file or app directory");
  const entries = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const child = path.join(directory, name);
      const info = fs.lstatSync(child);
      if (info.isSymbolicLink())
        throw new Error("App bundle links require an explicitly materialized simulator artifact");
      if (info.isDirectory()) walk(child);
      else if (info.isFile())
        entries.push([slash(path.relative(file, child)), sha256(fs.readFileSync(child))]);
      else throw new Error("Unsupported app bundle entry");
    }
  };
  walk(file);
  if (!entries.length) throw new Error("Empty app bundle");
  return sha256(JSON.stringify(entries));
}
