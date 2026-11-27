import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Issue #1287: a cold deep link (widget setup, `bycoda://project/...`, `/machines`, a resolved
// session reference) started a one-screen stack, so the header drew no back arrow and Android back
// left the app. Expo Router seeds the cold stack from the root layout's `unstable_settings.anchor`.
// These checks pin that contract at source level; the real stack is verified on a device.
const mobileRoot = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(mobileRoot, path), "utf8");

describe("root router anchor", () => {
  const layout = read("app/_layout.tsx");

  it("exports the tabs group as the anchor so Home sits under every cold deep link", () => {
    expect(layout).toMatch(/export const unstable_settings = \{ anchor: "\(tabs\)" \};/);
  });

  it("names a real root route: the tabs layout exists and is registered in the root stack", () => {
    expect(existsSync(join(mobileRoot, "app/(tabs)/_layout.tsx"))).toBe(true);
    expect(layout).toMatch(/<Stack\.Screen name="\(tabs\)"/);
  });

  it("does not override the anchor per group, which would route some links past Home", () => {
    const settings = layout.match(/export const unstable_settings = \{[^}]*\}/)?.[0] ?? "";
    expect(settings).not.toMatch(/initialRouteName|\(tabs\)":\s*\{/);
  });

  it("keeps the back arrow gated on canGoBack, which the anchor makes true for deep links", () => {
    expect(layout).toMatch(/headerLeft: \(\{ canGoBack \}\) => canGoBack \?/);
  });

  it("mounts the anchor alignment that puts a cold link's parent tab beneath it", () => {
    expect(layout).toMatch(/<NavigationAnchor \/>/);
  });
});

describe("guards beside the anchor", () => {
  it("keeps the session header's own fallback for a stack with nothing to pop", () => {
    expect(read("src/features/workspace/session-header.tsx")).toMatch(/goBack\("\/sessions"\)/);
  });

  it("restores the last session by pushing over Home and only without an explicit launch target", () => {
    const restore = read("src/features/workspace/last-session.ts");
    // Pushed as an external entry: from Home the Sessions tab goes beneath it (src/ui/navigation.ts).
    expect(restore).toMatch(/openExternalEntry\(\{\s*pathname: "\/session\/\[id\]"[\s\S]*?\{ push: true \}\)/);
    expect(restore).toMatch(/if \(input\.initialUrl \|\| input\.launchedFromNotification\) return null;/);
  });

  it("leaves the lock gate outside the router so the anchor never shows content before unlock", () => {
    const layout = read("app/_layout.tsx");
    expect(layout.indexOf("<AppProviders>")).toBeLessThan(layout.indexOf("<RootNavigation />"));
  });
});
