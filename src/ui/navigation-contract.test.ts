import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const mobile = fileURLToPath(new URL("../..", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// Diagnostics is owned elsewhere and is outside this contract.
const files = [...sources(join(mobile, "app")), ...sources(join(mobile, "src"))]
  .filter((path) => !relative(mobile, path).replaceAll("\\", "/").startsWith("src/features/diagnostics/"))
  .map((path) => ({ path: relative(mobile, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));

it("never replaces a pushed page with a tab root or list that is already beneath it", () => {
  // `router.replace` adds a second copy of Home or the list; `leaveTo` (dismissTo) returns to it.
  const offenders = files.filter(({ path, text }) => path !== "src/ui/error-boundary.tsx" &&
    /router\.replace\(\s*["'`]\/(chats|sessions|settings|inbox|manage)?["'`]\s*\)/.test(text)).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

it("in-page Back buttons use the shared fallback instead of a bare router.back()", () => {
  // The stack header (app/_layout.tsx) is gated by its own canGoBack; other code goes through goBack.
  const offenders = files.filter(({ path, text }) => path !== "app/_layout.tsx" && path !== "src/ui/navigation.ts" &&
    /router\.back\(\)/.test(text) && !/canGoBack/.test(text)).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

it("a prevented removal is retried through `repeat`, never re-dispatched while still prevented", () => {
  // Re-dispatching the prevented action while prevention is on asks again forever (a Back trap).
  const offenders = files.filter(({ text }) => /usePreventRemove\(/.test(text) &&
    /navigation\.dispatch\(\s*(data\.action|event\.action|leaving)\s*\)/.test(text)).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

it("page-level Android Back handlers yield to an open sheet", () => {
  // Only overlay owners (sheets, anchored menus) and the app lock subscribe to the raw hook.
  const allowed = new Set(["src/ui/overlays.tsx", "src/ui/anchored-menu.tsx", "src/ui/screen-back-handler.ts", "src/features/security/app-lock.tsx"]);
  const offenders = files.filter(({ path, text }) => !allowed.has(path) &&
    /from "panelui-native\/hooks\/use-back-handler"/.test(text)).map(({ path }) => path);
  expect(offenders).toEqual([]);
});
