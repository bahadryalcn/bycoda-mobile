import { describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { text: "ink", panel: "panel" } }) }));
vi.mock("./chat-styles", () => ({
  useChatTextStyles: (size: string) => ({ code: { fontSize: size === "large" ? 14 : 11, lineHeight: size === "large" ? 21 : 17, fontFamily: "mono" } }),
}));
vi.mock("./primitives", () => ({
  CodePanel: ({ children }: PropsWithChildren) => createElement("div", { "data-panel": true }, children),
  CodeText: ({ children, style }: PropsWithChildren<{ style?: object }>) =>
    createElement("pre", { "data-style": JSON.stringify(style) }, children),
}));
vi.mock("panelui-native/components/code-block", () => ({
  CodeBlock: ({ code, language, textStyle }: { code: string; language: string; textStyle: object }) =>
    createElement("code", { "data-language": language, "data-style": JSON.stringify(textStyle) }, code),
}));
import { CodeSource } from "./code-source";

describe("code source", () => {
  it("draws source with PanelUI CodeBlock at the reader's text size", () => {
    const html = renderToStaticMarkup(createElement(CodeSource, { code: "const a = 1;", language: "ts", textSize: "large" }));
    expect(html).toContain('data-language="ts"');
    expect(html).toContain("&quot;fontSize&quot;:14,&quot;lineHeight&quot;:21,&quot;fontFamily&quot;:&quot;mono&quot;");
    expect(html).toContain("const a = 1;");
  });
  it("wraps a plain page instead of scrolling one long line sideways", () => {
    const html = renderToStaticMarkup(createElement(CodeSource, { code: "x".repeat(50), language: "html", textSize: "compact", plain: true }));
    expect(html).toContain("data-panel");
    expect(html).not.toContain("data-language");
  });
});
