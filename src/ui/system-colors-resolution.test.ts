import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("selects the Android native reader while keeping Node, iOS, web and raw import resolution intact", () => {
  const require = createRequire(import.meta.url);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const module = { exports: {} as { resolver: { resolveRequest(context: unknown, name: string, platform: string): string } } };
  const mockRequire = Object.assign((name: string) => {
    if (name === "expo/metro-config") return { getDefaultConfig: () => ({ resolver: {} }) };
    if (name === "uniwind/metro") return { withUniwindConfig: (config: unknown) => config };
    return require(name);
  }, { resolve: (name: string) => name });
  runInNewContext(readFileSync(new URL("../../metro.config.cjs", import.meta.url), "utf8"), { require: mockRequire, module, __dirname: root });
  const resolve = module.exports.resolver.resolveRequest;
  const context = { resolveRequest: (_context: unknown, name: string) => name };
  const name = "../../modules/bycoda-system-colors/index.ts";
  expect(resolve(context, name, "android")).toBe(name.replace("index.ts", "index.android.ts"));
  for (const platform of ["ios", "web"]) expect(resolve(context, name, platform)).toBe(name);
  expect(resolve(context, "./another.ts?raw", "android")).toBe("./another.ts");
  expect(existsSync(new URL("../../modules/bycoda-system-colors/index.android.ts", import.meta.url))).toBe(true);
});
