import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, X509Certificate, createPublicKey } from "node:crypto";
import {
  bridgeChanges,
  bridgeSource,
  SECURE_STORE_VERSION,
  verifySecureStoreBridge,
} from "../../modules/bycoda-host-socket/patches/secure-store-bridge.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
describe("version-pinned SecureStore native provider upgrade fence", () => {
  it("matches the shared full-DER SPKI fixtures and rejects raw-point hashing", () => {
    const fixtureRoot = path.join(root, "modules/bycoda-host-socket/fixtures");
    const raw = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "host-spki.json"), "utf8"));
    const key = createPublicKey({
      key: Buffer.from(raw.subjectPublicKeyInfoDerHex, "hex"),
      format: "der",
      type: "spki",
    });
    const pin =
      "sha256/" +
      createHash("sha256")
        .update(key.export({ type: "spki", format: "der" }))
        .digest("base64");
    expect(pin).toBe(raw.pin);
    expect(
      "sha256/" +
        createHash("sha256").update(Buffer.from(raw.x963PublicKeyHex, "hex")).digest("base64"),
    ).not.toBe(pin);
    const ca = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "public-ca-pin-vector.json"), "utf8"),
    );
    expect(
      "sha256/" +
        createHash("sha256")
          .update(
            new X509Certificate(ca.caCertificatePem).publicKey.export({
              type: "spki",
              format: "der",
            }),
          )
          .digest("base64"),
    ).toBe(ca.caSpkiPin);
  });
  it("applies the maintained patch to the installed SDK's real native sources", () => {
    expect(verifySecureStoreBridge(path.join(root, "node_modules/expo-secure-store"))).toBe(
      SECURE_STORE_VERSION,
    );
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.dependencies["expo-secure-store"]).toBe(SECURE_STORE_VERSION);
    expect(fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")).toContain(
      `expo-secure-store@${SECURE_STORE_VERSION}: modules/bycoda-host-socket/patches/`,
    );
  });
  it("requires review after a version/private-routine change and exports no JS secret getter", () => {
    for (const change of bridgeChanges) {
      const source = fs.readFileSync(
        path.join(root, "node_modules/expo-secure-store", change.file),
        "utf8",
      );
      expect(() => bridgeSource("57.0.5", source, change)).toThrow(/upgrading/);
      expect(() =>
        bridgeSource(
          SECURE_STORE_VERSION,
          source.replace(change.anchor, "changed private routine"),
          change,
        ),
      ).toThrow(/routine changed/);
      const patched = bridgeSource(SECURE_STORE_VERSION, source, change);
      expect(patched).not.toMatch(
        /(?:AsyncFunction|Function)\("bycodaHost(?:Read|Write|Delete)Native"/,
      );
      expect(patched).toContain(change.addition);
    }
  });
});
