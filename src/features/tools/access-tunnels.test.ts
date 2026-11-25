// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AccessTunnels, type AccessTunnel } from "./access-tunnels";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  ScopeLine: ({ scope }: { scope: { computer?: string } }) => createElement("div", null, scope.computer),
  StatusText: ({ label }: { label: string }) => createElement("span", null, label),
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
  Sheet: ({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) =>
    createElement("section", null, title, children, createElement("button", { onClick: onClose }, "Close")),
}));

it("shows live tunnel status and addresses with only a close action, even when the Host can stop it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onClose = vi.fn();
  const tunnel: AccessTunnel = {
    id: "reviewed", provider: "cloudflare", target: "host", localUrl: "http://127.0.0.1:3000",
    publicUrl: "https://service.example.invalid", startedAt: 1, state: "ready", canStop: true,
  };
  try {
    const render = (state: AccessTunnel["state"]) =>
      act(async () => root.render(createElement(AccessTunnels, { computer: "Computer", tunnel: { ...tunnel, state }, onClose })));
    await render("ready");
    expect(container.textContent).toContain("Public address reachability is unverified.");
    expect(container.textContent).toContain(tunnel.publicUrl);
    expect(container.textContent).toContain(tunnel.localUrl);
    expect(container.textContent).toContain("Manage tunnels in bycoda on the computer.");
    expect(container.textContent).toContain("Ready");
    expect([...container.querySelectorAll("button")].map(({ textContent }) => textContent)).toEqual(["Close"]);
    await render("stopped");
    expect(container.textContent).toContain("Stopped");
    await act(async () => container.querySelector("button")!.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
