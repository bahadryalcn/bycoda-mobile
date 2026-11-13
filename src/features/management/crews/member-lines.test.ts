import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { CrewAgent, SavedCrewAgent } from "@/remote/contracts/crews";

const fixture = vi.hoisted(() => ({ text: [] as Array<{ children?: unknown; numberOfLines?: number }> }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: { caption: {} } }) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 6, xs: 4 } }));
vi.mock("@/ui/primitives", () => ({
  Body: (props: PropsWithChildren<{ numberOfLines?: number }>) => { fixture.text.push(props); return createElement("span", null, props.children); },
  Badge: ({ label }: { label: string }) => createElement("span", null, label),
}));
vi.mock("./member-avatar", () => ({ MemberAvatar: () => createElement("span", null, "portrait") }));
import { MemberLines } from "./member-lines";
const member = (id: string, extra: Partial<CrewAgent> = {}): CrewAgent => ({
  id, role: "specialist", name: id, instructions: "", selection: "fixed", candidates: [], ...extra,
});
beforeEach(() => { fixture.text = []; });
it("keeps long member identity and role readable in expanded crew details", () => {
  const agent = member("research", { name: "Aleksandra Wiśniewska-Kowalczyk İstanbul araştırma ekibi 🧪", handle: "istanbul-research-specialist", source: { id: "saved", updatedAt: 1 } });
  const library: SavedCrewAgent[] = [{ ...agent, id: "saved", updatedAt: 1 }];
  const markup = renderToStaticMarkup(createElement(MemberLines, { agents: [agent], library, roleLabel: () => "Uluslararası ürün araştırması uzmanı" }));
  expect(markup).toContain(agent.name); expect(markup).toContain("@istanbul-research-specialist"); expect(markup).toContain("Library");
  expect(fixture.text).toHaveLength(2);
  expect(fixture.text.every((text) => text.numberOfLines === undefined)).toBe(true);
});
it("omits absent optional metadata and handles short and empty rosters", () => {
  const markup = renderToStaticMarkup(createElement(MemberLines, { agents: [member("Jo")] }));
  expect(markup).toContain("Jo"); expect(markup).not.toContain("undefined"); expect(markup).not.toContain(" · ");
  expect(fixture.text).toHaveLength(1);
  fixture.text = []; renderToStaticMarkup(createElement(MemberLines, { agents: [] })); expect(fixture.text).toEqual([]);
});

