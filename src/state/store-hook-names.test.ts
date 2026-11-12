import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

// React Compiler only treats `use*` callees as hooks. Calling a bound zustand store
// through a non-hook name lets the compiler memoize the call, so the store hook is
// skipped on later renders ("change in the order of Hooks") and the app crashes.
const root = join(__dirname, "..");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

it("calls bound zustand stores only through hook-named callees", () => {
  const files = sources(root).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const stores = files.flatMap(({ text }) =>
    [...text.matchAll(/export const ([a-z]\w*) = create\w*\(/g)]
      .map((match) => match[1]!)
      .filter((name) => !name.startsWith("use")),
  );
  const violations = files.flatMap(({ path, text }) =>
    stores.flatMap((name) =>
      [...text.matchAll(new RegExp(`(?<![\\w.])${name}\\(`, "g"))].map(
        () => `${relative(root, path)}: ${name}(...)`,
      ),
    ),
  );
  expect(violations).toEqual([]);
});
