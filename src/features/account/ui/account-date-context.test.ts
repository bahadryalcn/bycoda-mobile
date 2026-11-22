// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  timeZone: "UTC", locale: "tr", queries: [] as Array<{ queryKey: readonly unknown[] }>,
  active: "active", listener: undefined as undefined | ((state: string) => void), removed: vi.fn(),
}));
vi.mock("./use-graced-read-error", () => ({ useGracedReadError: (query: { error: unknown }) => query.error ?? null }));
vi.mock("react-native", () => ({ AppState: { get currentState() { return fixture.active; }, addEventListener: (_event: string, listener: (state: string) => void) => { fixture.listener = listener; return { remove: fixture.removed }; } } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => { fixture.queries.push(options); return options.queryKey[1] === "me" ? { data: { user: { deletion: { purgeAfter: "2026-12-01T12:00:00Z" } } } } : { data: undefined, isError: false }; },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }), useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn() }));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: { client: {} }, device: {} }) }));
vi.mock("@/i18n", () => ({ useLocale: () => fixture.locale }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (_match, key: string) => String(values?.[key])) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/info-hint", () => ({ HintSection: ({ children }: PropsWithChildren) => createElement("section", null, children) }));

vi.mock("lucide-react-native/icons/calendar", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/calendar-days", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/calendar-range", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/external-link", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/undo-2", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Section: Group, Stack: Group, NavigationGroup: Group, NavigationRow: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label), SettingIcon: () => null, ValueRow: ({ label, value }: { label: string; value: string }) => createElement("p", null, `${label}: ${value}`), Separator: () => null, ErrorNotice: () => null, Skeleton: () => null, Button: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message) };
});
import { ActivitySection } from "./ActivitySection";
import { ManageAccountSection } from "./ManageAccountSection";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T23:59:59Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.timeZone = "UTC"; fixture.locale = "tr"; fixture.active = "active"; fixture.listener = undefined; fixture.queries = [];
  const Original = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) { const formatter = new Original(locales, options); if (!locales && !options) { const resolved = formatter.resolvedOptions(); formatter.resolvedOptions = () => ({ ...resolved, timeZone: fixture.timeZone }); } return formatter; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const activityKey = () => fixture.queries.filter((query) => query.queryKey[1] === "activity").at(-1)?.queryKey;
it("switches Today query date when midnight passes while account stays mounted", async () => {
  await act(() => root.render(createElement(ActivitySection))); expect(activityKey()).toEqual(["account", "activity", "2026-11-13", "UTC"]);
  await act(async () => vi.advanceTimersByTimeAsync(1_000)); expect(activityKey()).toEqual(["account", "activity", "2026-11-14", "UTC"]);
});
it("refreshes local date and time zone immediately on returning from background", async () => {
  await act(() => root.render(createElement(ActivitySection)));
  await act(() => fixture.listener?.("background")); fixture.timeZone = "Asia/Tokyo"; vi.setSystemTime(new Date("2026-11-14T23:30:00Z"));
  await act(() => fixture.listener?.("active")); expect(activityKey()).toEqual(["account", "activity", "2026-11-15", "Asia/Tokyo"]);
});
it("formats scheduled deletion with selected app locale and updates when it changes", async () => {
  const format = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation((locale) => `date-for-${String(locale ?? "device")}`);
  await act(() => root.render(createElement(ManageAccountSection))); expect(container.textContent).toContain("date-for-tr");
  fixture.locale = "de"; await act(() => root.render(createElement(ManageAccountSection))); expect(container.textContent).toContain("date-for-de"); expect(format).toHaveBeenLastCalledWith("de");
});
