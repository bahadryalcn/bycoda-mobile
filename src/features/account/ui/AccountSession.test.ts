// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
vi.mock("../model/config", () => ({ accountConfig: { apiUrl: "https://account.example.test" } }));
vi.mock("../model/account-runtime", () => ({ createAccountRuntime: () => ({ registerDevice: async () => ({ id: "phone" }), releaseDevice: async () => {} }) }));
vi.mock("../model/device-registration", () => ({ deviceRegistration: () => ({}) }));
vi.mock("../model/device-info", () => ({ readDeviceInfo: () => ({}) }));
vi.mock("../model/device-store", () => ({ secureDeviceIdStore: {}, securePushMarkStore: { clear: async () => {} } }));
vi.mock("../model/push-account", () => ({ useAccountPushSync: () => {}, useAccountHostPushDedupe: () => {} }));
vi.mock("../model/push-read", () => ({ useAccountPushReads: () => {} }));
vi.mock("../model/account-access", () => ({ useAccountAccess: { setState: vi.fn() } }));
import { AccountSession } from "./AccountSession";

it("clears cached account information when authentication ends outside the in-app sign-out button", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient();
  const root = createRoot(document.createElement("div"));
  const auth = { loaded: true, signedIn: true, getToken: async () => null, signOut: async () => {} };
  const render = (signedIn: boolean) => h(QueryClientProvider, { client }, h(AccountSession, { auth: { ...auth, signedIn } }));
  client.setQueryData(["account", "me"], { user: { email: "previous-owner@example.test" } });
  client.setQueryData(["account", "devices"], { items: [{ name: "Previous owner's phone" }] });
  try {
    await act(async () => root.render(render(true)));
    expect(client.getQueryData(["account", "me"])).toBeDefined();
    await act(async () => root.render(render(false)));
    expect(client.getQueryData(["account", "me"])).toBeUndefined();
    expect(client.getQueryData(["account", "devices"])).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    client.clear(); vi.unstubAllGlobals();
  }
});
