const { withAppBuildGradle } = require("expo/config-plugins");

const signing = `    def storeKey = System.getenv('BYCODA_ANDROID_KEYSTORE')
    signingConfigs {
        if (storeKey) {
            release {
                storeFile file(storeKey)
                storePassword System.getenv('BYCODA_ANDROID_STORE_PASSWORD')
                keyAlias System.getenv('BYCODA_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('BYCODA_ANDROID_KEY_PASSWORD')
            }
        }`;
const releaseDebugSigning = /(\brelease\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/;
const releaseSigning = "signingConfig(storeKey ? signingConfigs.release : signingConfigs.debug)";

function configureSigning(contents) {
  if (contents.includes(signing) && contents.includes(releaseSigning)) return contents;
  if (!contents.includes("    signingConfigs {") || !releaseDebugSigning.test(contents)) {
    throw new Error("Android Gradle template changed. Review the store signing configuration.");
  }
  return contents
    .replace("    signingConfigs {", signing)
    .replace(releaseDebugSigning, `$1${releaseSigning}`);
}

module.exports = (config) => withAppBuildGradle(config, (next) => {
  if (!process.env.BYCODA_ANDROID_KEYSTORE) return next;
  if (next.modResults.language !== "groovy") throw new Error("Expected Android Groovy Gradle configuration.");
  next.modResults.contents = configureSigning(next.modResults.contents);
  return next;
});
module.exports.configureSigning = configureSigning;
