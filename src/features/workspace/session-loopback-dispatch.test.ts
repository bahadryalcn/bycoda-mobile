// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionLoopbackBrowser } from "./session-loopback-browser";
import { useLoopbackLink } from "@/ui/loopback-link";
import { PrivateContentAccessProvider } from "@/ui/private-access";

const f = vi.hoisted(() => ({ caps: [] as string[], supported: true, allowed: true }));
vi.mock("../../../modules/bycoda-host-socket", () => ({ tunnelSupported: () => f.supported }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine-a", capabilities: f.caps }) }));
vi.mock("./session-browser", () => ({ SessionBrowser: ({ initialUrl }: any) => createElement("p", { "data-kind": "host" }, initialUrl) }));
vi.mock("./session-tunnel-browser", () => ({
  SessionTunnelBrowser: ({ href, onHostBrowser }: any) => createElement("button", { "data-kind": "tunnel", onClick: () => onHostBrowser(href) }, href),
}));

let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
function Link() {
  const owner = useLoopbackLink();
  return createElement("a", { id: "link", onClick: () => owner?.open("http://localhost:3000/x") }, "link");
}
const render = () => act(async () => root.render(createElement(PrivateContentAccessProvider, { value: { allowed: f.allowed, check: () => f.allowed } },
  createElement(SessionLoopbackBrowser, { scope: { machineId: "machine-a", sessionId: "s" }, projectId: "p", children: createElement(Link) }))));
const tap = () => act(async () => (container.querySelector("#link") as HTMLElement).click());
const kind = () => container.querySelector("[data-kind]")?.getAttribute("data-kind");

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); f.caps = []; f.supported = true; f.allowed = true; });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("opens on the phone with the capability and native support", async () => {
  f.caps = ["browser.shared", "dev.servers.tunnel.v1"];
  await render(); await tap();
  expect(kind()).toBe("tunnel");
});
it("uses the Host Browser without the capability", async () => {
  f.caps = ["browser.shared"];
  await render(); await tap();
  expect(kind()).toBe("host");
});
it("uses the Host Browser without native support", async () => {
  f.caps = ["dev.servers.tunnel.v1"]; f.supported = false;
  await render(); await tap();
  expect(kind()).toBe("host");
});
it("keeps the private-access check", async () => {
  f.caps = ["dev.servers.tunnel.v1"]; f.allowed = false;
  await render(); await tap();
  expect(kind()).toBeUndefined();
});
it("switches the same link to the Host Browser from the toolbar", async () => {
  f.caps = ["dev.servers.tunnel.v1"];
  await render(); await tap();
  await act(async () => (container.querySelector("[data-kind=tunnel]") as HTMLElement).click());
  expect(kind()).toBe("host");
  expect(container.querySelector("[data-kind=host]")?.textContent).toBe("http://localhost:3000/x");
});
