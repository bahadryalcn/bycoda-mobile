const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withUniwindConfig } = require("uniwind/metro");
const config = getDefaultConfig(__dirname);
// Share pure wire contracts with the desktop while keeping native dependencies
// in this app's independent pnpm workspace.
// Only the parent folders mobile imports from. Watching the whole parent repository (docs,
// Rust targets, desktop bundles, its node_modules) exhausted file handles on Windows (EMFILE).
config.watchFolders = ["src", "host", "packages", "public"].map((folder) =>
  path.resolve(__dirname, "..", folder),
);
// Shared contracts live beside this app; generated desktop/build and audit files do not.
// Exclude them from the file map so native startup and refresh do not crawl those trees.
const excludedTree = (...segments) =>
  new RegExp(
    "^" +
      path
        .resolve(__dirname, "..", ...segments)
        .split(path.sep)
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[/\\\\]") +
      "(?:[/\\\\]|$)",
  );
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  excludedTree("temp"),
  excludedTree("build"),
  excludedTree("target"),
  excludedTree("src-tauri", "target"),
  excludedTree(".git"),
];
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules"),
];
// This app owns its dependency links independently. Resolve the portable package
// through its real folder/exports even before a root workspace link is installed.
// The existing parent watchFolder already includes packages/core.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@bycoda/core": path.resolve(__dirname, "../packages/core"),
};
// Shared desktop modules may reach Vite-only "file?raw" imports (desktop locale loaders) that
// mobile never executes. Resolve them as the plain file so one such import cannot stop the bundle.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName.endsWith("?raw") ? moduleName.slice(0, -4) : moduleName;
  return (resolveRequest ?? context.resolveRequest)(context, name, platform);
};
const themedConfig = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
  // Keep in step with the non-default palettes in src/ui/palettes.ts (palettes.test.ts checks this).
  extraThemes: ["bycoda", "bycoda-dark", "olive", "olive-dark", "tide", "tide-dark", "kiln", "kiln-dark", "dusk", "dusk-dark", "ink", "ink-dark"],
});
// Preserve upstream CSS/native transformation while fixing Windows web theme registration.
themedConfig.transformerPath = require.resolve("./scripts/uniwind-transformer.cjs");
module.exports = themedConfig;
