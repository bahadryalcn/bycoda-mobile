import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rail = readFileSync(new URL("./tablet-rail.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./tablet-quick-panel.tsx", import.meta.url), "utf8");

/** #945: in a short tablet window every rail button must stay reachable. */
describe("tablet rail scrolling", () => {
  it("puts tabs, New, Voice and Settings in a single ScrollView", () => {
    expect(rail.match(/<ScrollView\b/g)).toHaveLength(1);
    const body = rail.slice(rail.indexOf("<ScrollView"), rail.indexOf("</ScrollView>"));
    for (const marker of ['accessibilityRole="tablist"', 'copy("Yeni oturum", "New session")', 'copy("Sesli asistan", "Voice assistant")', 'copy("Ayarlar", "Settings")']) {
      expect(body).toContain(marker);
    }
  });

  it("keeps Settings at the bottom when the height allows and the spacer from collapsing when it does not", () => {
    expect(rail).toContain("contentContainerStyle={{ flexGrow: 1, alignItems: \"center\" }}");
    expect(rail).toContain("<View style={{ flex: 1, minHeight: space.md }} />");
  });

  it("shows that the column scrolls and does not bounce when everything fits", () => {
    expect(rail).toContain("showsVerticalScrollIndicator");
    expect(rail).toContain("persistentScrollbar");
    expect(rail).toContain("alwaysBounceVertical={false}");
  });

  it("keeps the safe-area padding and opens New session as a screen, not a sheet in the scroller", () => {
    const frame = rail.slice(rail.indexOf("paddingTop: insets.top"), rail.indexOf("<ScrollView"));
    expect(frame).toContain("paddingBottom: Math.max(insets.bottom, space.sm)");
    expect(frame).toContain("paddingStart: insets.left + space.sm");
    expect(rail).not.toContain("<NewSessionSheet");
    expect(rail).toContain("openNewChat()");
  });

  it("keeps the 48dp targets, tab roles and routes", () => {
    expect(rail).toContain("minHeight: metrics.touchTarget + space.md");
    expect(rail.match(/role="tab"/g)).toHaveLength(2);
    expect(rail).toContain('go("/settings")');
    expect(rail).toContain('router.navigate({ pathname: "/assistant", params: { voice: "1" } })');
  });
});

/** #946: one name and one entry point per destination, and a hint that describes the gesture. */
describe("tablet rail and quick panel naming", () => {
  it("describes the long press on New session instead of repeating the voice label", () => {
    expect(rail).toContain('hint={copy("Sesli asistan için basılı tutun", "Hold for voice assistant")}');
    expect(rail).not.toContain('hint={copy("Sesli asistan", "Voice assistant")}');
  });

  it("tells the quick panel whether the rail has New session and Voice", () => {
    expect(panel).toContain("{ session: Boolean(machineId) }");
  });
});
