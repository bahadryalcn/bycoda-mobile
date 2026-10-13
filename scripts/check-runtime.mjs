import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
const desktopSource = path.resolve(mobileRoot, "../src");
// These contracts are deliberately free of desktop UI, browser storage and Tauri.
const pureContracts = new Set([
  "shared/i18n/languages",
  "integrations/mobile-pairing",
  "integrations/mobile-lan",
  "features/connections/model/protocol",
  "features/inbox/model/remoteInbox",
  "features/tasks/model/taskRules",
  "features/skills/model/cliCommands",
  "features/social/model/socialLimits",
  "integrations/mobile-pairing",
]);
const errors = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(file);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /\bimport\s+(type\s+)?[\w$*{},\s]+?\s+from\s*['"]([^'"]+)['"]/g,
    )) {
      if (match[1]) continue;
      // Some Lucide aliases have types but no runtime file; catch them before Metro.
      if (match[2].startsWith("lucide-react-native/icons/")) {
        try {
          if (!existsSync(fileURLToPath(import.meta.resolve(match[2]))))
            errors.push(
              `${path.relative(mobileRoot, file)}: Use a canonical Lucide runtime icon: ${match[2]}`,
            );
        } catch {
          errors.push(
            `${path.relative(mobileRoot, file)}: Cannot resolve Lucide runtime icon: ${match[2]}`,
          );
        }
      }
      if (!match[2].startsWith(".")) continue;
      const imported = path.resolve(path.dirname(file), match[2]);
      const relative = path.relative(desktopSource, imported).replaceAll("\\", "/");
      if (
        !relative.startsWith("../") &&
        !path.isAbsolute(relative) &&
        !pureContracts.has(relative.replace(/\.tsx?$/, ""))
      ) {
        const line = source.slice(0, match.index).split("\n").length;
        errors.push(
          `${path.relative(mobileRoot, file)}:${line} Use a pure shared contract or an import type; desktop runtime code cannot run on mobile.`,
        );
      }
    }
  }
}
await inspect(path.join(mobileRoot, "src"));
await inspect(path.join(mobileRoot, "app"));
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    "Mobile runtime boundary passed: desktop imports are types or approved pure contracts.\n",
  );
