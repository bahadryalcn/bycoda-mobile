import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const avatar = readFileSync(new URL("./agent-avatar.tsx", import.meta.url), "utf8");
const body = avatar.slice(avatar.indexOf("export function AgentAvatar("), avatar.indexOf("export function ProviderAccountMark("));

/** #1121: the generic fallback mark is white artwork and must follow the theme like every other brand call site. */
describe("AgentAvatar fallback mark", () => {
  it("tints the white brand mark with the theme brand colour", () => {
    expect(avatar).toContain('require("../../../public/brand/bycoda/mark-white.png")');
    expect(body).toMatch(/tintColor=\{providerSource \? undefined : colors\.brand\}/);
  });

  it("leaves the codex and claude provider glyphs untinted", () => {
    expect(body).toContain("const providerSource = providers[provider as keyof typeof providers];");
    expect(body).toContain("const source = providerSource ?? mark;");
    expect(body).not.toMatch(/tintColor=\{colors\.brand\}/);
  });

  it("keeps the tile, user glyph and image sizing unchanged", () => {
    expect(body).toContain("backgroundColor: user ? colors.selected : colors.raised");
    expect(body).toContain("<UserRound size={size * 0.57} color={colors.text} />");
    expect(body).toContain('contentFit="contain"');
    expect(body).toContain("style={{ width: size * 0.77, height: size * 0.77 }}");
  });
});
