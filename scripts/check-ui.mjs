import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const violations = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(file);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) continue;
    const source = await readFile(file, "utf8");
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const rules = [];
    rules.push([/from\s+["']nativewind(?:["']|\/)/g, "Use the single UniWind styling engine"]);
    rules.push([
      /\b(?:bg|text|border|ring|fill|stroke)-\[#[\da-f]+\]/gi,
      "Use semantic theme utilities",
    ]);
    if (relative !== "src/ui/tokens.ts")
      rules.push([/['"]#[\da-f]{3,8}['"]/gi, "Use colors from ui/tokens.ts"]);
    if (!relative.startsWith("src/ui/")) {
      rules.push([
        /from\s+["\']@\/ui\/gluestack(?:\/|["\'])/g,
        "Use product UI facades instead of raw gluestack parts",
      ]);
      rules.push([
        /<(?:TextInput|Pressable|Switch)\b/g,
        "Use shared Input, Field, PressableCard, IconButton or ToggleField",
      ]);
      rules.push([
        /\b(?:fontSize|borderRadius)\s*:\s*\d/g,
        "Use shared typography and radius tokens",
      ]);
      rules.push([/\bfontFamily\s*:/g, "Use shared CodeText or uiStyles.mono"]);
    }
    for (const [pattern, message] of rules)
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${relative}:${line} ${message}`);
      }
  }
}
await inspect(path.join(root, "src"));
await inspect(path.join(root, "app"));
if (violations.length) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else
  process.stdout.write("Mobile UI consistency passed: shared colors, controls and typography.\n");
