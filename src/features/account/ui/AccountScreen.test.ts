// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { AccountScreen } from "./AccountScreen";
const state = vi.hoisted(() => ({ signOut: vi.fn(), name: "👩🏽‍💻 Priya", me: { user: { displayName: "👩🏽‍💻 Priya", email: "priya@example.test" } } }));
vi.mock("./use-graced-read-error", () => ({ useGracedReadError: (query: { error: unknown }) => query.error ?? null }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("panelui-native/components/avatar", () => ({ Avatar: ({ fallback }: { fallback: string }) => h("span", { "data-avatar": fallback }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("lucide-react-native/icons/log-out", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _body: string, _label: string, action: () => void) => action() }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("p", null, children), Heading: ({ children }: PropsWithChildren) => h("h1", null, children),
  Screen: ({ children }: PropsWithChildren) => h("main", null, children), Stack: ({ children }: PropsWithChildren) => h("div", null, children), Section: () => null, StateView: () => null, Loading: () => null, Skeleton: () => null,
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => h("button", { onClick: onPress, disabled }, label),
  NavigationGroup: ({ children }: PropsWithChildren) => h("div", null, children), SettingIcon: () => null,
  NavigationRow: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => h("button", { onClick: onPress, disabled }, label),
  ErrorNotice: ({ error }: { error?: Error }) => error ? h("p", { role: "alert" }, error.message) : null,
}));
vi.mock("./ActivitySection", () => ({ ActivitySection: () => null }));
vi.mock("./DevicesSection", () => ({ DevicesSection: () => null }));
vi.mock("./ManageAccountSection", () => ({ ManageAccountSection: () => null }));
vi.mock("./PushSection", () => ({ PushSection: () => null }));
vi.mock("./SignInPanel", () => ({ SignInPanel: () => null }));
vi.mock("./AccountWelcome", () => ({ AccountWelcome: () => null }));
vi.mock("./account-context", () => ({ useAccount: () => ({ status: "signedIn", runtime: { client: { getMe: async () => state.me } }, device: {}, signOut: state.signOut }) }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; state.signOut.mockReset(); vi.unstubAllGlobals(); });
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["account", "me"], state.me);
  await act(async () => root!.render(h(QueryClientProvider, { client }, h(AccountScreen))));
  return container;
}
it("keeps a complete emoji grapheme in the profile fallback", async () => {
  const container = await render();
  expect(container.querySelector("[data-avatar]")?.getAttribute("data-avatar")).toBe("👩🏽‍💻");
});
it("shows sign-out failure beside its action and handles rejection without losing the account", async () => {
  state.signOut.mockRejectedValue(new Error("Sign-out service unavailable"));
  const container = await render();
  await act(async () => { container.querySelector("button")!.click(); await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(state.signOut).toHaveBeenCalledOnce();
  expect(container.querySelector("[role=alert]")?.textContent).toBe("Sign-out service unavailable");
  expect(container.querySelector("button")?.disabled).toBe(false);
});
