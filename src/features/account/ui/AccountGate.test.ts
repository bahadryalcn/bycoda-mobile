import { createElement as h, isValidElement } from "react";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "loading" }));
vi.mock("./account-context", () => ({ useAccount: () => state }));
vi.mock("./AccountScreen", () => ({ AccountScreen: "AccountScreen" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
import { AccountGate } from "./AccountGate";

it("keeps the top inset while the account is loading", () => {
  state.status = "loading";
  const result = AccountGate({ children: h("workspace") });
  if (!isValidElement<{ edges: string[]; children: { type: unknown } }>(result)) throw new Error("Missing account entry");
  expect(result.type).toBe("SafeAreaView");
  expect(result.props.edges).toEqual(["top"]);
  expect(result.props.children.type).toBe("AccountScreen");
});

it.each(["unavailable", "signedOut"])("shows the full-bleed account entry instead of the workspace while %s", status => {
  state.status = status;
  const result = AccountGate({ children: h("workspace") });
  expect(isValidElement(result) && result.type).toBe("AccountScreen");
});

it("mounts the requested workspace only after authentication", () => {
  state.status = "signedIn";
  const child = h("workspace", { project: "preserved-deep-link" });
  expect(AccountGate({ children: child })).toBe(child);
});
