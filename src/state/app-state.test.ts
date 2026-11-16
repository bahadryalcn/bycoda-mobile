import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("lazy react-native imports", () => {
  it("never loads the whole react-native namespace at runtime", () => {
    // Metro evaluates every export for a namespace import; on iOS PushNotificationIOS throws.
    const offenders = sources(join(__dirname, ".."))
      .filter((file) =>
        /import\(\s*["']react-native["']\s*\)(?!\.)/.test(readFileSync(file, "utf8")),
      )
      .filter((file) => !file.endsWith("app-state.ts"));
    expect(offenders).toEqual([]);
  });
});
