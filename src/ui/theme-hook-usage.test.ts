import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, it } from "vitest";

// React Compiler treats imported module values as constants. `colors`, `semanticColors`,
// `uiStyles` and createThemedStyles sheets are live accessors, so a component that reads them
// directly keeps its memoized JSX after a theme switch. Render code must destructure them from
// useMobileTheme() / useThemedStyles() inside the component (see src/ui/README.md, Theming).
const root = join(__dirname, "..", "..");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "illustrations" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
// Theme plumbing and style factories read the accessors by design; the toast reads them in a call
// that runs later (an event handler), and brand.tsx only reads `colors` inside its sheet factory.
const exempt = /^src\/ui\/(tokens|theme|themed-styles|styles|chat-styles|toast|brand)\.tsx?$/;
const live = ["colors", "semanticColors", "uiStyles"];

it("reads theme colors and shared styles only through the theme hooks", () => {
  const violations: string[] = [];
  for (const path of [...sources(join(root, "src")), ...sources(join(root, "app"))]) {
    const name = relative(root, path).split(sep).join("/");
    if (exempt.test(name)) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g)) {
      if (!/(^|\/)(tokens|styles)$/.test(match[2]!)) continue;
      for (const part of match[1]!.split(",")) {
        const entry = part.trim();
        if (entry.startsWith("type ")) continue;
        const imported = entry.split(/\s+as\s+/)[0]!;
        if (live.includes(imported)) violations.push(`${name}: imports ${imported}; destructure it from useMobileTheme()`);
      }
    }
    for (const match of text.matchAll(/const (\w+) = createThemedStyles\(/g)) {
      if (!new RegExp(`useThemedStyles\\(${match[1]}\\)`).test(text))
        violations.push(`${name}: ${match[1]} is never read through useThemedStyles()`);
    }
  }
  expect(violations).toEqual([]);
});
