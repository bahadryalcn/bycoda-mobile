// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ views: [] as any[] }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { panel: "#fff", text: "#000" } }) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("react-native", () => ({
 View: ({ children }: PropsWithChildren) => createElement("div", null, children),
 ScrollView: ({ children }: PropsWithChildren) => createElement("section", null, children),
}));
vi.mock("react-native-webview", () => ({ WebView: (props: any) => {
 fixture.views.push(props); return createElement("article", null, "Preview content");
} }));
vi.mock("./primitives", () => ({
 Row: ({ children }: PropsWithChildren) => createElement("div", null, children),
 Button: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { onClick: onPress }, label),
 Loading: () => createElement("p", null, "Loading"),
 ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", null, String(error)) : null,
}));
import { HtmlPreview } from "./html-preview";
import { HtmlPreview as WebHtmlPreview } from "./html-preview.web";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const render = (html = "<p>First</p>") => act(async () => root.render(createElement(HtmlPreview, { html })));
const view = () => fixture.views.at(-1)!;
const click = (label: string) => act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === label)!.click());
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.views = []; container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("retires old native events when retry starts", async () => {
 await render(); const old = view(); await act(async () => old.onError()); await click("Retry");
 await act(async () => old.onLoadEnd()); expect(container.textContent).toContain("Loading");
 await act(async () => old.onContentProcessDidTerminate()); expect(container.textContent).not.toContain("Preview stopped.");
 await act(async () => view().onLoadEnd()); expect(container.textContent).not.toContain("Loading");
});
it("clears old failures on source replacement without re-enabling interaction", async () => {
 await render(); await click("Interaction on"); const old = view(); await act(async () => old.onError());
 await render("<p>Second</p>"); expect(container.textContent).not.toContain("Preview could not be opened."); expect(container.textContent).toContain("Loading");
 expect(view().javaScriptEnabled).toBe(false); await act(async () => old.onError()); expect(container.textContent).not.toContain("Preview could not be opened.");
});
it("keeps an error visible after native load-end for the same failed attempt", async () => {
 await render(); const current = view(); await act(async () => { current.onError(); current.onLoadEnd(); });
 expect(container.textContent).toContain("Preview could not be opened."); expect(container.textContent).not.toContain("Loading");
 expect(current.allowFileAccess).toBe(false); expect(current.domStorageEnabled).toBe(false);
 expect(current.onShouldStartLoadWithRequest({url:"https://example.com"})).toBe(false);
});

it("uses available preview space instead of a fixed WebView height in fill mode", async () => {
 await act(async () => root.render(createElement(HtmlPreview, { html: "<p>Full</p>", fill: true })));
 expect(view().style).toEqual({ flex: 1, minHeight: 0 });
});

it("keeps web interaction choice and sandbox restrictions across source changes", async () => {
 const renderWeb = (html: string) => act(async () => root.render(createElement(WebHtmlPreview, { html, fill: true })));
 await renderWeb("<p>One</p>"); expect(container.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-scripts");
 await click("Interaction on"); await renderWeb("<p>Two</p>");
 const frame = container.querySelector("iframe")!; expect(frame.getAttribute("sandbox")).toBe("");
 expect(frame.style.flex).toBe("1 1 0%"); expect(frame.style.height).toBe("");
 expect(frame.getAttribute("srcdoc")).toContain("<p>Two</p>"); expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
});

for(const platform of ["native","web"]){
 it(`accepts a reader-owned interaction choice on ${platform}`,async()=>{
  const toggle=vi.fn();const component=platform==="native"?HtmlPreview:WebHtmlPreview;
  const renderOwned=(enabled:boolean)=>act(async()=>root.render(createElement(component,{html:"<p>Owned</p>",fill:true,interaction:{enabled,toggle}})));
  await renderOwned(false);await click("Interaction off");expect(toggle).toHaveBeenCalledOnce();
  if(platform==="native")expect(view().javaScriptEnabled).toBe(false);else expect(container.querySelector("iframe")!.getAttribute("sandbox")).toBe("");
  await renderOwned(true);if(platform==="native")expect(view().javaScriptEnabled).toBe(true);else expect(container.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-scripts");
 });
}
