// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-image", () => ({
  Image: ({ source, style, testID, accessible, importantForAccessibility }: {
    source: string; style: { width: number; height: number }; testID: string; accessible: boolean; importantForAccessibility: string;
  }) => createElement("img", {
    src: String(source), width: style.width, height: style.height, "data-testid": testID,
    "data-accessible": String(accessible), "data-importance": importantForAccessibility,
  }),
}));

vi.mock("./art", () => {
  const names = ["connect-computer", "no-projects", "no-sessions", "chat-empty", "inbox-empty", "search-empty",
    "unreachable", "error", "success", "locked", "permission", "offline"];
  return { art: Object.fromEntries(names.map((name, index) => [name, { source: `${name}.png`, aspect: index % 2 ? 0.7 : 1.6 }])) };
});

import { Illustration, illustrationNames } from "./index";

const render = (name: (typeof illustrationNames)[number], size?: number) => {
  const holder = document.createElement("div");
  holder.innerHTML = renderToStaticMarkup(createElement(Illustration, { name, size }));
  return holder.querySelector("img")!;
};

describe("state illustration family", () => {
  it.each(illustrationNames)("renders %s as decorative art at the requested height", (name) => {
    const image = render(name, 120);
    expect(image.getAttribute("data-testid")).toBe(`illustration-${name}`);
    expect(image.getAttribute("data-accessible")).toBe("false");
    expect(image.getAttribute("data-importance")).toBe("no-hide-descendants");
    expect(Number(image.getAttribute("height"))).toBe(120);
    // Wide scenes never grow past 1.4x their height, so a state column keeps its width.
    expect(Number(image.getAttribute("width"))).toBeLessThanOrEqual(168);
  });

  it("gives all twelve states distinct art", () => {
    expect(illustrationNames).toHaveLength(12);
    expect(new Set(illustrationNames.map((name) => render(name).getAttribute("src"))).size).toBe(12);
  });
});
