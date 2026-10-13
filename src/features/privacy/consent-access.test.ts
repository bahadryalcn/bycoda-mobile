import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProviderPermission,
  hasProviderPermission,
  readPermittedCredential,
  useProviderPermission,
} from "./consent-access";
import { consentScope } from "./consent-store";

const computer = { environmentId: "computer-a", providers: ["codex"] };
afterEach(() => useProviderPermission.setState({ scopes: {} }));
describe("request-time data sharing permission", () => {
  it("denies unloaded or different providers before accessing the saved credential", async () => {
    const read = vi.fn(async () => "secret");
    await expect(
      readPermittedCredential(read, () => assertProviderPermission(computer)),
    ).rejects.toThrow("Allow");
    expect(read).not.toHaveBeenCalled();
    useProviderPermission.setState({
      scopes: {
        [consentScope(computer.environmentId, computer.providers)]: true,
      },
    });
    expect(hasProviderPermission(computer)).toBe(true);
    expect(hasProviderPermission({ ...computer, providers: ["claude"] })).toBe(false);
    expect(hasProviderPermission(null)).toBe(false);
  });
  it("blocks a credential read already pending when consent is withdrawn", async () => {
    useProviderPermission.setState({
      scopes: {
        [consentScope(computer.environmentId, computer.providers)]: true,
      },
    });
    let finish!: (value: string) => void;
    const reading = readPermittedCredential(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      () => assertProviderPermission(computer),
    );
    useProviderPermission.setState({ scopes: {} });
    finish("secret");
    await expect(reading).rejects.toThrow("Allow");
  });
});
