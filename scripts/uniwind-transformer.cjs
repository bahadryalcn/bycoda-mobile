const path = require("node:path");
const upstream = require(path.join(path.dirname(require.resolve("uniwind/metro")), "transformer.cjs"));

exports.transform = (config, projectRoot, filePath, data, options) => {
  // shortcut: Uniwind 1.13.2 matches this web registration module with POSIX separators only;
  // remove when its transformer accepts Windows paths and the registration regression passes upstream.
  const portablePath = filePath.replaceAll("\\", "/");
  const registrationPath = options.platform === "web" && portablePath.endsWith("/components/web/metro-injected.js")
    ? portablePath : filePath;
  return upstream.transform(config, projectRoot, registrationPath, data, options);
};
