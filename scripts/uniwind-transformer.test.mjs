import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import { PALETTE_IDS, uniwindThemeName } from "../src/ui/palettes.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const upstreamPath = path.join(path.dirname(require.resolve("uniwind/metro")), "transformer.cjs");

function loadCommonJS(filename, override) {
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const resolve = id => override?.(id) ?? localRequire(id);
  resolve.resolve = localRequire.resolve;
  vm.runInNewContext(`(function(require,module,exports,__dirname,__filename){${readFileSync(filename, "utf8")}\n})`, { Buffer, process, console })(resolve, module, module.exports, path.dirname(filename), filename);
  return module.exports;
}

function configuration() {
  return loadCommonJS(path.join(root, "metro.config.cjs"), id => id === "expo/metro-config"
    ? { getDefaultConfig: () => ({ projectRoot: root, resolver: { sourceExts: [], assetExts: [] }, transformer: {} }) }
    : undefined);
}

function transformer(config) {
  const worker = { transform: (_config, _root, filePath, data, options) => ({ filePath, data, options }) };
  // Keep the installed Uniwind transform real. Capture only its Expo JS-worker boundary.
  const upstream = loadCommonJS(upstreamPath, id => id === "@expo/metro-config"
    ? { unstable_transformerPath: "fixture-worker" }
    : id === "fixture-worker" || id === "metro-transform-worker" ? worker : undefined);
  if (config.transformerPath === upstreamPath) return upstream;
  return loadCommonJS(config.transformerPath, id => id === upstreamPath ? upstream : undefined);
}

function runtimeRegistry() {
  const filename = path.join(path.dirname(require.resolve("uniwind/package.json")), "dist/common/core/config/config.common.js");
  // Run the installed runtime's registration and setTheme validation, with native APIs isolated.
  const runtime = loadCommonJS(filename, id => {
    if (id === "react-native") return { Appearance: { getColorScheme: () => "light", addChangeListener: () => ({ remove() {} }) }, Platform: { OS: "web" } };
    if (id.endsWith("/common/consts")) return { ColorScheme: { Light: "light" }, StyleDependency: {} };
    if (id.endsWith("/useCSSVariable/useCSSVariable")) return { getCSSVariable() {} };
    if (id.endsWith("/listener")) return { UniwindListener: { notify() {} } };
    return undefined;
  });
  return new runtime.UniwindConfigBuilder();
}

for (const separator of ["/", "\\"]) test(`registers every actual theme through installed web transformer with ${JSON.stringify(separator)} paths`, async () => {
  const config = configuration();
  const filename = path.join(root, "node_modules/uniwind/dist/module/components/web/metro-injected.js").replaceAll(path.sep, separator);
  const result = await transformer(config).transform(config.transformer, root, filename, Buffer.from("// Will be replaced by metro resolver"), { platform: "web", type: "module", dev: true });
  const registry = runtimeRegistry();
  const code = result.data.toString("utf8").replace("import { Uniwind } from 'uniwind';", "");
  vm.runInNewContext(code, { Uniwind: registry });
  const expected = PALETTE_IDS.flatMap(id => ["light", "dark"].map(mode => uniwindThemeName(id, mode)));
  assert.deepEqual(Array.from(registry.themes), expected);
  for (const theme of expected) assert.doesNotThrow(() => registry.setTheme(theme));
  assert.doesNotThrow(() => registry.setTheme("system"));
});

for (const platform of ["ios", "android", "web"]) test(`forwards ordinary ${platform} source without path or content changes`, async () => {
  const config = configuration();
  const filename = "src\\ui\\provider.tsx";
  const data = Buffer.from("export default null;");
  const options = { platform, type: "module", dev: true };
  const result = await transformer(config).transform(config.transformer, root, filename, data, options);
  assert.equal(result.filePath, filename); assert.equal(result.data, data); assert.equal(result.options, options);
});
