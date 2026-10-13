const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withUniwindConfig } = require("uniwind/metro");
const config = getDefaultConfig(__dirname);
// Share pure wire contracts with the desktop while keeping native dependencies
// in this app's independent pnpm workspace.
config.watchFolders = [path.resolve(__dirname, "..")];
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
  excludedTree("src-tauri", "target"),
  excludedTree(".git"),
];
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules"),
];
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
