// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => { vi.stubGlobal("require", () => 1); return { request: vi.fn(), current: true, image: vi.fn() }; });
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("expo-image", () => ({ Image: (props: unknown) => { f.image(props); return h("img"); } }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ request: f.request }), useHostReadActive: () => true, hostKey: (id: string, parts: unknown[]) => [id, ...parts] }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ review: { id: "host" }, token: "epoch", isCurrent: () => f.current }) }));
import { AssistantAvatar } from "./assistant-avatar";
let root: ReturnType<typeof createRoot>, cache: QueryClient;
function mount(value: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"); root = createRoot(container); cache = new QueryClient();
  return { container, render: () => root.render(h(QueryClientProvider, { client: cache }, h(AssistantAvatar, { value, size: 80 }))) };
}
afterEach(async () => { await act(async () => root?.unmount()); cache?.clear(); f.current = true; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("uses the Host profile's text avatar with whole graphemes", async () => {
  const { container, render } = mount("👩🏽‍💻"); await act(async () => render());
  expect(container.textContent).toBe("👩🏽‍💻"); expect(f.request).not.toHaveBeenCalled();
});
it("keeps unknown presets and unavailable portrait IDs as the orb", async () => {
  const { container, render } = mount("preset:newer-host-avatar"); await act(async () => render());
  expect(container.textContent).toBe(""); expect(container.querySelector("img")).toBeNull(); expect(f.request).not.toHaveBeenCalled();
});
it("reads a generated portrait through the scoped existing Host method", async () => {
  const value = "image:12345678-1234-1234-1234-123456789abc";
  f.request.mockResolvedValueOnce({ dataUrl: "data:image/png;base64,YQ==" });
  const { container, render } = mount(value); await act(async () => render());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(f.request).toHaveBeenCalledWith("assistant.builder.avatarRead", { id: value.slice(6) }, { retry: false, timeoutMs: 30000 });
  expect(container.querySelector("img")).not.toBeNull();
});
it("rejects network image URLs and never displays a late portrait from a revoked connection", async () => {
  let resolve!: (value: unknown) => void; f.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { container, render } = mount("image:12345678-1234-1234-1234-123456789abc"); await act(async () => render());
  f.current = false; await act(async () => { resolve({ dataUrl: "https://untrusted.example/portrait.png" }); });
  expect(container.querySelector("img")).toBeNull(); expect(f.image).not.toHaveBeenCalled();
});
