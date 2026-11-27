import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch, createTwoFilesPatch } from "diff";

export const SECURE_STORE_VERSION = "58.0.3";
export const bridgeChanges = [
  {
    file: "android/src/main/java/expo/modules/securestore/SecureStoreModule.kt",
    anchor:
      "  private suspend fun getItemImpl(key: String, options: SecureStoreOptions): String? {",
    addition: `  // Native-only bycoda CredentialProvider seam. Never registered in ModuleDefinition.
  suspend fun bycodaHostReadNative(key: String): String? = getItemImpl(key, SecureStoreOptions())
  suspend fun bycodaHostWriteNative(key: String, value: String) {
    setItemImpl(key, value, SecureStoreOptions(), false)
  }
  fun bycodaHostDeleteNative(key: String) { deleteItemImpl(key, SecureStoreOptions()) }

`,
  },
  {
    file: "ios/SecureStoreModule.swift",
    anchor: "  private func get(with key: String, options: SecureStoreOptions) throws -> String? {",
    addition: `  // Native-only bycoda CredentialProvider seam. Never registered in ModuleDefinition.
  public func bycodaHostReadNative(_ key: String) throws -> String? {
    return try get(with: key, options: SecureStoreOptions())
  }
  public func bycodaHostWriteNative(_ key: String, value: String) throws {
    var options = SecureStoreOptions()
    options.keychainAccessible = .whenUnlockedThisDeviceOnly
    _ = try set(value: value, with: key, options: options)
  }
  public func bycodaHostDeleteNative(_ key: String) throws {
    let options = SecureStoreOptions()
    for authentication: Bool? in [nil, false, true] {
      let status = SecItemDelete(query(with: key, options: options, requireAuthentication: authentication) as CFDictionary)
      if status != errSecSuccess && status != errSecItemNotFound { throw KeyChainException(status) }
    }
  }

`,
  },
];
export function bridgeSource(version, source, change) {
  if (version !== SECURE_STORE_VERSION)
    throw new Error("Review the SecureStore native provider before upgrading its pinned version.");
  if (!source.includes(change.anchor))
    throw new Error(`SecureStore native routine changed: ${change.file}`);
  if (source.includes(change.addition)) return source;
  return source.replace(change.anchor, change.addition + change.anchor);
}
const folder = path.dirname(fileURLToPath(import.meta.url));
export function verifySecureStoreBridge(secureStoreFolder) {
  const version = JSON.parse(
    fs.readFileSync(path.join(secureStoreFolder, "package.json"), "utf8"),
  ).version;
  const patch = fs.readFileSync(
    path.join(folder, `expo-secure-store@${SECURE_STORE_VERSION}.patch`),
    "utf8",
  );
  for (const change of bridgeChanges) {
    const source = fs.readFileSync(path.join(secureStoreFolder, change.file), "utf8");
    const expected = bridgeSource(version, source, change);
    if (source === expected) continue;
    const start = patch.indexOf(`diff --git a/${change.file} `);
    const end = patch.indexOf("diff --git ", start + 1);
    const section = patch.slice(start, end < 0 ? undefined : end);
    if (start < 0 || applyPatch(source, section) !== expected)
      throw new Error(`SecureStore patch drift: ${change.file}`);
  }
  return version;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const secureStoreFolder = path.resolve(folder, "../../../node_modules/expo-secure-store");
  if (process.argv.includes("--generate")) {
    const version = JSON.parse(
      fs.readFileSync(path.join(secureStoreFolder, "package.json"), "utf8"),
    ).version;
    let patch = "";
    for (const change of bridgeChanges) {
      const source = fs.readFileSync(path.join(secureStoreFolder, change.file), "utf8");
      const updated = bridgeSource(version, source, change);
      if (source === updated)
        throw new Error(
          "Regenerate from the unpatched pinned package, not an already patched installation.",
        );
      patch +=
        `diff --git a/${change.file} b/${change.file}\n` +
        createTwoFilesPatch(`a/${change.file}`, `b/${change.file}`, source, updated).replace(
          /^={3,}\n/,
          "",
        );
    }
    fs.writeFileSync(path.join(folder, `expo-secure-store@${SECURE_STORE_VERSION}.patch`), patch);
  }
  console.log(
    `SecureStore ${verifySecureStoreBridge(secureStoreFolder)} native-only bridge patch verified.`,
  );
}
