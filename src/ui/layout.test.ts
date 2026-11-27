// @vitest-environment happy-dom
import { act, createElement, Fragment, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ refresh: {} as any, viewport: {} as any, frames: [] as Array<(event:any)=>void>, footerStyle:{} as any, footerContent:{} as any, keyboardVisible:false, insets: { top: 0, right: 0, bottom: 0, left: 0 } }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn(() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })) }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./tokens", async () => {
 const actual=await vi.importActual<typeof import("./tokens")>("./tokens");
 return {...actual,colors:{},metrics:{...actual.metrics,contentWidth:960},space:{...actual.space,screen:16,lg:24}};
});
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("react-native", () => ({
  View: ({ children,onLayout }: PropsWithChildren<{onLayout?:(event:any)=>void}>) => {if(onLayout)fixture.frames.push(onLayout);return createElement("div", null, children);},
  useWindowDimensions: () => ({width:430,height:800,fontScale:1}),
  ScrollView: ({children,style,contentContainerStyle}:PropsWithChildren<{style?:any;contentContainerStyle?:any}>) => {fixture.footerStyle=style;fixture.footerContent=contentContainerStyle;return createElement("aside", {"data-action-scroll":true},children);},
  Text: ({ children }: PropsWithChildren) => createElement("span", null, children),
  StyleSheet: { flatten: (style: unknown) => style },
  RefreshControl: (props: unknown) => { fixture.refresh = props; return null; },
}));
vi.mock("react-native-keyboard-controller", () => ({
  useKeyboardState:(select:any)=>select({isVisible:fixture.keyboardVisible}),
  KeyboardAvoidingView:({children,enabled}:any)=>createElement("div",{"data-keyboard-frame":enabled},children),
  KeyboardAwareScrollView: ({ children, refreshControl, onLayout, enabled }: any) => { fixture.viewport=onLayout; return createElement("section", { "data-page-scroll": true,"data-keyboard-scroll":enabled }, refreshControl, children); }
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => fixture.insets }));
vi.mock("react-native-reanimated", () => ({ default: { View: "div" } }));
vi.mock("panelui-native/components/card", () => ({ Card: "div" }));
vi.mock("panelui-native/components/page-header", () => {
  const part = (name: string) => ({ children, style }: any) => createElement("div", {
    "data-page-header": name, "data-style": JSON.stringify(style),
  }, children);
  return { PageHeader: Object.assign(part("root"), {
    Content: part("content"), Title: part("title"), Description: part("description"), Actions: part("actions"),
  }) };
});
vi.mock("./design-system", () => ({ surfaceClasses: "" }));
vi.mock("./header-back-button", () => ({ HeaderBackButton: () => null }));
vi.mock("./scope-line", () => ({ ScopeLine: () => null, ScopePills: ({ scope }: { scope: { computer?: string; project?: string } }) => createElement("span", { "data-scope-pills": true }, [scope.computer, scope.project].filter(Boolean).join(" | ")) }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./use-pull-refresh", () => ({ usePullRefresh: vi.fn() }));
import { Screen, ScreenChromeProvider, ScreenHeading, sectionTitleText, useScreenHeading } from "./layout";

describe("page identity and action ownership", () => {
  it("uses PanelUI header parts for the page identity without dropping actions", () => {
    const props = { title: "Projects", subtitle: "Computer", actions: createElement("button", null, "Add") };
    for (const heading of [createElement(ScreenHeading, props)]) {
      const html = renderToStaticMarkup(heading);
      for (const part of ["root", "title", "description", "actions"]) {
        expect(html).toContain(`data-page-header="${part}"`);
      }
      expect(html).toContain("Projects");
      expect(html).toContain("Computer");
      expect(html).toContain("Add");
    }
  });
  it("keeps page actions outside the single page scroller", () => {
    const html = renderToStaticMarkup(createElement(Screen, { footer: createElement("button", null, "Command") }, createElement("p", null, "Output")));
    expect(html.match(/data-page-scroll/g)).toHaveLength(1);
    expect(html.indexOf("Output")).toBeLessThan(html.indexOf("</section>"));
    expect(html.indexOf("Command")).toBeGreaterThan(html.indexOf("</section>"));
  });
  it("uses an externally shared pull controller without requiring a query", () => {
    const onRefresh = vi.fn(async () => {});
    renderToStaticMarkup(createElement(Screen, { refreshState: { refreshing: true, onRefresh } }));
    expect(fixture.refresh.refreshing).toBe(true); expect(fixture.refresh.onRefresh).toBe(onRefresh);
  });
  it("uses one combined page/computer identity without repeating title or subtitle", () => {
    const identity = vi.fn(({ title, subtitle }: { title: string; subtitle?: string }) =>
      createElement("button", null, title, " · Computer · ", subtitle));
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { headerIdentity: identity },
      createElement(ScreenHeading, { title: "Projects", subtitle: "12 projects", actions: createElement("button", null, "Add") })));
    expect(html.match(/Projects/g)).toHaveLength(1);
    expect(html.match(/12 projects/g)).toHaveLength(1);
    expect(html).toContain("Computer");
    expect(html).toContain("Add");
  });

  it("native title ownership hides the repeated title but never the actions or context", () => {
    const identity = vi.fn();
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true, headerIdentity: identity },
      createElement(ScreenHeading, { title: "Terminal", subtitle: "Project A", actions: createElement("button", null, "Create") })));
    expect(html).not.toContain("Terminal");
    expect(html).toContain("Project A");
    expect(html).toContain("Create");
    expect(identity).not.toHaveBeenCalled();
  });

  it("does not leave an empty content header under a native title", () => {
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(ScreenHeading, { title: "Settings" })));
    expect(html).toBe("");
  });

  it("keeps an interactive scope and direct actions when the navigator owns the title", () => {
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(ScreenHeading, { title: "Goals", context: createElement("button", null, "Project A"),
        actions: createElement("button", null, "New goal") })));
    expect(html).not.toContain("Goals");
    expect(html.match(/Project A/g)).toHaveLength(1);
    expect(html.match(/New goal/g)).toHaveLength(1);
  });

  it("retains a context-only heading without a duplicate title or an action", () => {
    function ContextHeading() {
      return useScreenHeading({ title: "Notes", context: createElement("button", null, "All projects") });
    }
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true }, createElement(ContextHeading)));
    expect(html).toContain("All projects");
    expect(html).not.toContain("Notes");
  });

  it("forwards scrolling Screen context without creating another scroll owner", () => {
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(Screen, { title: "Tasks", context: createElement("button", null, "Project scope") },
        createElement("input", { defaultValue: "Draft" }))));
    expect(html).not.toContain("Tasks");
    expect(html.match(/Project scope/g)).toHaveLength(1);
    expect(html.match(/data-page-scroll/g)).toHaveLength(1);
    expect(html.indexOf("Project scope")).toBeLessThan(html.indexOf("</section>"));
  });

  it("does not leave a padded wrapper when a non-scrolling screen uses its native title", () => {
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(Screen, { title: "Session", scroll: false }, createElement("span", null, "Content"))));
    expect(html).toContain("<div><span>Content</span></div>");
    expect(html).not.toContain("Session");
  });
});


it("reports the padded body viewport without counting native header or footer safe area twice",()=>{
 fixture.insets={top:48,right:32,bottom:34,left:24};const viewport=vi.fn();
 try {
  renderToStaticMarkup(createElement(Screen,{onContentViewport:viewport},"Body"));
  fixture.viewport({nativeEvent:{layout:{width:500,height:300}}});expect(viewport).toHaveBeenLastCalledWith({width:444,height:226});
  renderToStaticMarkup(createElement(Screen,{onContentViewport:viewport,footer:createElement("button",null,"Paste")},"Body"));
  fixture.viewport({nativeEvent:{layout:{width:500,height:240}}});expect(viewport).toHaveBeenLastCalledWith({width:444,height:200});
  renderToStaticMarkup(createElement(ScreenChromeProvider,{bottomSafeArea:false},createElement(Screen,{onContentViewport:viewport},"Body")));
  fixture.viewport({nativeEvent:{layout:{width:100,height:20}}});expect(viewport).toHaveBeenLastCalledWith({width:44,height:0});
 } finally {fixture.insets={top:0,right:0,bottom:0,left:0};}
});

it("retains a measured scene through transient zero layouts and keeps the body mounted when footer availability changes",()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 fixture.frames=[];const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const body=createElement("input",{defaultValue:"Saved draft"}),footer=createElement("button",null,"Action");
 try {
  act(()=>root.render(createElement(Screen,{footer},body)));
  const field=host.querySelector("input")!;field.focus();field.setSelectionRange(2,7);
  expect(host.querySelector('[data-keyboard-frame="true"]')).not.toBeNull();
  expect(host.querySelector('[data-keyboard-scroll="false"]')).not.toBeNull();
  const measure=fixture.frames[0];
  act(()=>measure({nativeEvent:{layout:{height:200}}}));expect(fixture.footerStyle.maxHeight).toBe(112);
  for(const height of [0,-1,NaN,Infinity])act(()=>measure({nativeEvent:{layout:{height}}}));
  expect(fixture.footerStyle.maxHeight).toBe(112);
  act(()=>root.render(createElement(Screen,null,body)));
  expect(host.querySelector('[data-keyboard-frame="false"]')).not.toBeNull();
  expect(host.querySelector('[data-keyboard-scroll="true"]')).not.toBeNull();
  act(()=>root.render(createElement(Screen,{footer},body)));
  expect(host.querySelector("input")).toBe(field);expect(field.value).toBe("Saved draft");
  expect(document.activeElement).toBe(field);expect([field.selectionStart,field.selectionEnd]).toEqual([2,7]);
 } finally {act(()=>root.unmount());host.remove();}
});

it("removes only the footer navigation inset while the IME owns the bottom edge",()=>{
 fixture.insets.bottom=24;
 try {
  const page=createElement(Screen,{footer:createElement("button",null,"Action")},"Body");
  renderToStaticMarkup(page);const idle=fixture.footerContent.paddingBottom;
  fixture.keyboardVisible=true;renderToStaticMarkup(page);
  expect(idle-fixture.footerContent.paddingBottom).toBe(24);
  fixture.keyboardVisible=false;renderToStaticMarkup(page);
  expect(fixture.footerContent.paddingBottom).toBe(idle);
 }finally {fixture.insets.bottom=0;fixture.keyboardVisible=false;}
});

it("keeps short section titles on one line and lets long ones wrap", () => {
  expect(sectionTitleText("Access & privacy")).toBe(`Access${String.fromCharCode(0xa0)}&${String.fromCharCode(0xa0)}privacy`);
  const long = "A very long section title that must still be able to wrap";
  expect(sectionTitleText(long)).toBe(long);
});

describe("one page-top scope row", () => {
  it("shows the computer as a pill and lets the route's project pill replace a static project", async () => {
    const { ScreenScopeControl } = await import("./screen-chrome");
    const pill = createElement("button", null, "Project pill");
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(ScreenScopeControl, { value: pill },
        createElement(ScreenHeading, { title: "Terminals", scope: { computer: "bab", project: "bycoda" }, actions: createElement("button", null, "Refresh") }))));
    expect(html).toContain("data-scope-pills");
    expect(html).toContain("bab");
    expect(html).not.toContain("bycoda");
    expect(html.match(/Project pill/g)).toHaveLength(1);
    expect(html).toContain("Refresh");
  });
  it("keeps a static project pill when nothing can change it", () => {
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true },
      createElement(ScreenHeading, { title: "Board", scope: { computer: "bab", project: "Jira project" } })));
    expect(html).toContain("bab | Jira project");
  });
});

describe("computer scope in the page top", () => {
  it("leads a page that follows the active computer with the switchable pill and binds other pages read-only", async () => {
    const { ScreenComputerControl } = await import("./screen-chrome");
    const Switcher = () => createElement("button", null, "Computer switcher");
    const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ScreenComputerControl, { value: Switcher },
      createElement(ScreenChromeProvider, { nativeTitle: true }, createElement(ScreenHeading, { title: "Page", ...props }))));
    const following = render({ scope: { computer: "bab" }, computerSwitch: true });
    expect(following).toContain("Computer switcher");
    expect(following).not.toContain("data-scope-pills");
    // A project pill of its own means the page reads the active computer.
    expect(render({ scopeControl: createElement("button", null, "Project pill") })).toContain("Computer switcher");
    const bound = render({ scope: { computer: "bab" } });
    expect(bound).not.toContain("Computer switcher");
    expect(bound).toContain("bab");
    // A tab identity already carries the computer pill.
    const tab = renderToStaticMarkup(createElement(ScreenComputerControl, { value: Switcher },
      createElement(ScreenChromeProvider, { headerIdentity: () => createElement("nav", null, "Tab identity") },
        createElement(ScreenHeading, { title: "Inbox", scopeControl: createElement("button", null, "Project pill") }))));
    expect(tab).not.toContain("Computer switcher");
  });
});

describe("tab title row trailing command", () => {
  it("puts the app-wide command at the far right of a tab's title row only", () => {
    const identity = () => createElement("nav", null, "Inbox · bab");
    const html = renderToStaticMarkup(createElement(ScreenChromeProvider, { headerIdentity: identity, headerTrailing: createElement("button", null, "Voice assistant") },
      createElement(ScreenHeading, { title: "Inbox", actions: createElement("button", null, "Add") })));
    expect(html.indexOf("Add")).toBeLessThan(html.indexOf("Voice assistant"));
    expect(html.indexOf("Inbox · bab")).toBeLessThan(html.indexOf("Add"));
    // A pushed page under a native title never shows it.
    const pushed = renderToStaticMarkup(createElement(ScreenChromeProvider, { nativeTitle: true, headerTrailing: createElement("button", null, "Voice assistant") },
      createElement(ScreenHeading, { title: "Tasks", actions: createElement("button", null, "Add") })));
    expect(pushed).not.toContain("Voice assistant");
  });
});

describe("pushed page top row", () => {
  it("counts icon actions through fragments and fits title and pills only when they keep readable names", async () => {
    const { countActions, fitsHeaderRow } = await import("./layout");
    expect(countActions(createElement(Fragment, null, createElement("button"), null, createElement(Fragment, null, createElement("button"))))).toBe(2);
    expect(fitsHeaderRow({ width: 430, fontScale: 1, title: "Notes", pills: 2, actions: 1 })).toBe(true);
    // Narrow phone with three icons, long title or large text: pills move to the row below.
    expect(fitsHeaderRow({ width: 360, fontScale: 1, title: "Tasks", pills: 2, actions: 3 })).toBe(false);
    expect(fitsHeaderRow({ width: 430, fontScale: 1.4, title: "Notes", pills: 2, actions: 1 })).toBe(false);
  });
  it("hands title, pills and actions to the native top row when they fit, else keeps the scope row", async () => {
    const { ScreenHeaderRow } = await import("./screen-chrome");
    const rows: { identity: unknown; actions?: unknown }[] = [];
    const Bridge = (props: { identity: unknown; actions?: unknown }) => { rows.push(props); return null; };
    const pill = createElement("button", null, "Project pill");
    const render = (title: string) => renderToStaticMarkup(createElement(ScreenHeaderRow, { value: Bridge as never },
      createElement(ScreenChromeProvider, { nativeTitle: true },
        createElement(ScreenHeading, { title, scopeControl: pill, actions: createElement("button", null, "Add") }))));
    const fitted = render("Notes");
    expect(rows.at(-1)?.identity).toBeTruthy();
    expect(fitted).not.toContain("Project pill");
    const crowded = render("A very long page title that cannot share its row");
    expect(crowded).toContain("Project pill");
    expect(crowded).toContain("Add");
  });
});
