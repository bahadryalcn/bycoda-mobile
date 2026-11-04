// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ previews: [] as any[] }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark" }) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("../../assets/mermaid-runtime", () => ({ default: "trusted-runtime" }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("./html-preview", () => ({ HtmlPreview: (props: any) => { fixture.previews.push(props); return createElement("article", null, "Diagram"); } }));
vi.mock("./primitives", () => ({
 Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
 Button: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { onClick: onPress }, label),
 Sheet: ({ visible, children, scroll }: PropsWithChildren<{visible: boolean; scroll: boolean}>) => visible ? createElement("main", { "data-scroll": String(scroll) }, children) : null,
}));
import { MessageDiagram } from "./message-diagram";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.previews = []; container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("fills an existing preview without adding another Expand layer", async () => {
 await act(async () => root.render(createElement(MessageDiagram, { source: "flowchart TD\nA-->B", fill: true })));
 expect(fixture.previews.at(-1).fill).toBe(true); expect(container.querySelector("button")).toBeNull();
 expect(fixture.previews.at(-1).trustedRuntime).toBe("trusted-runtime");
 expect(fixture.previews.at(-1).html).toContain("securityLevel:'strict'");
 expect(fixture.previews.at(-1).html).toContain('id="diagram-controls"');
});
it("expands an inline diagram into a non-scrolling Sheet with a filling preview", async () => {
 await act(async () => root.render(createElement(MessageDiagram, { source: "flowchart TD\nA-->B" })));
 await act(async () => container.querySelector("button")!.click());
 expect(container.querySelector("main")!.dataset.scroll).toBe("false"); expect(fixture.previews.at(-1).fill).toBe(true);
});
it("retains source-budget rejection without constructing a preview", async () => {
 await act(async () => root.render(createElement(MessageDiagram, { source: "a".repeat(32_001), fill: true })));
 expect(fixture.previews).toHaveLength(0); expect(container.textContent).toContain("Diagram exceeds the preview limit");
});
