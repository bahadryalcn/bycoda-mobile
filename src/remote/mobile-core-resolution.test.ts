import { createRequire } from "node:module";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageRoot = resolve(appRoot, "../packages/core");
const config = require(join(appRoot, "metro.config.cjs"));
const { resolve: metroResolve } = require(
  require.resolve("metro-resolver", {
    paths: [dirname(require.resolve("expo/metro-config"))],
  }),
);
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const tsconfig = JSON.parse(readFileSync(join(appRoot, "tsconfig.json"), "utf8"));
const lookup = (path: string) => {
  try {
    const stat = statSync(path);
    return { exists: true, type: stat.isDirectory() ? "d" : "f", realPath: realpathSync(path) };
  } catch {
    return { exists: false };
  }
};
function getPackage(path: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function getPackageForModule(path: string) {
  let current = lookup(path).type === "d" ? path : dirname(path);
  for (;;) {
    const json = getPackage(join(current, "package.json"));
    if (json)
      return { rootPath: current, packageJson: json, packageRelativePath: relative(current, path) };
    const parent = dirname(current);
    if (parent === current || current.endsWith("node_modules")) return null;
    current = parent;
  }
}

it.each(["android", "ios"])(
  "resolves every portable core export in Metro and TypeScript without a root node_modules link (%s)",
  (platform) => {
    expect(config.resolver.extraNodeModules["@bycoda/core"]).toBe(packageRoot);
    expect(config.resolver.unstable_enablePackageExports).toBe(true);
    expect(
      config.watchFolders.some((folder: string) => !relative(folder, packageRoot).startsWith("..")),
    ).toBe(true);
    expect(Object.keys(packageJson.exports)).toEqual([
      ".",
      "./json-text",
      "./concurrent",
      "./text",
      "./session-title",
    ]);
    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      const name = subpath === "." ? "@bycoda/core" : `@bycoda/core/${subpath.slice(2)}`;
      const expected = realpathSync(resolve(packageRoot, target as string));
      expect(resolve(appRoot, tsconfig.compilerOptions.paths[name][0])).toBe(expected);
      const result = metroResolve(
        {
          allowHaste: false,
          assetExts: new Set(),
          customResolverOptions: {},
          dev: true,
          // Deliberately disable both node_modules lookup paths: only the package-folder mapping may resolve this.
          disableHierarchicalLookup: true,
          nodeModulesPaths: [],
          extraNodeModules: config.resolver.extraNodeModules,
          doesFileExist: (path: string) => lookup(path).type === "f",
          fileSystemLookup: lookup,
          getPackage,
          getPackageForModule,
          mainFields: config.resolver.resolverMainFields,
          originModulePath: resolve(appRoot, "../src/shared/lib/jsonText.ts"),
          preferNativePlatform: true,
          resolveAsset: () => null,
          redirectModulePath: (path: string) => path,
          resolveHasteModule: () => null,
          resolveHastePackage: () => null,
          sourceExts: config.resolver.sourceExts,
          isESMImport: true,
          unstable_enablePackageExports: true,
          unstable_conditionNames: ["react-native", "import"],
          unstable_conditionsByPlatform: {},
          unstable_logWarning: (warning: string) => {
            throw new Error(warning);
          },
        },
        name,
        platform,
      );
      expect(result).toEqual({ type: "sourceFile", filePath: expected });
    }
  },
);
