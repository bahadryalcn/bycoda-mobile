// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ refetch: vi.fn(), data: undefined as undefined | { today: number; week: number; month: number; year: number }, error: true }));
vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: fixture.data, isError: fixture.error, refetch: fixture.refetch }) }));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: { client: {} }, device: { id: "phone" } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (_, key) => String(values?.[key] ?? key)) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Section: Group, Stack: Group, Button: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { onClick: onPress }, label) };
});
vi.mock("@/ui/metric-row", () => ({ MetricRow: ({ label, value }: { label: string; value: string }) => createElement("p", null, `${label}: ${value}`) }));
import { ActivitySection } from "./ActivitySection";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.data = undefined; fixture.error = true; fixture.refetch.mockReset(); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("offers an explicit read retry after the first activity request fails", async () => {
  await act(async () => root.render(createElement(ActivitySection)));
  expect(container.textContent).toContain("Active time could not be loaded right now.");
  const retry = [...container.querySelectorAll("button")].find(node => node.textContent === "Try again");
  expect(retry).toBeDefined(); await act(async () => retry!.click()); expect(fixture.refetch).toHaveBeenCalledOnce();
});
it("keeps known activity readings when a refresh fails and does not replace them with zero", async () => {
  fixture.data = { today: 7, week: 64, month: 200, year: 600 };
  await act(async () => root.render(createElement(ActivitySection)));
  expect(container.textContent).toContain("Today: 7m"); expect(container.textContent).toContain("This week: 1h 4m");
  expect(container.querySelector("button")).toBeNull();
});
