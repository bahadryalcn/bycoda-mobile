import { afterEach, expect, it } from "vitest";
import { isAccountAccessAllowed, useAccountAccess } from "./account-access";

afterEach(() => useAccountAccess.setState({ status: "loading" }));

it("requires a loaded signed-in account, including builds without account configuration", () => {
  for (const status of ["loading", "signedOut", "unavailable"] as const) {
    useAccountAccess.setState({ status });
    expect(isAccountAccessAllowed()).toBe(false);
  }
  useAccountAccess.setState({ status: "signedIn" });
  expect(isAccountAccessAllowed()).toBe(true);
});

it("notifies request owners immediately when sign-out closes access", () => {
  useAccountAccess.setState({ status: "signedIn" });
  const seen: boolean[] = [];
  const release = useAccountAccess.subscribe(() => seen.push(isAccountAccessAllowed()));
  useAccountAccess.setState({ status: "signedOut" });
  release();
  expect(seen).toEqual([false]);
});
