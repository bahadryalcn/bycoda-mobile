const { withAndroidManifest } = require("expo/config-plugins");

// Dynamic private IPs cannot be listed as Android domain exceptions. Application
// validation permits LAN HTTP only with a QR-pinned key; all payloads are encrypted.
module.exports = (config) =>
  withAndroidManifest(config, (next) => {
    const app = next.modResults.manifest.application?.[0];
    if (!app) throw new Error("Missing Android application manifest.");
    app.$["android:usesCleartextTraffic"] = "true";
    return next;
  });
