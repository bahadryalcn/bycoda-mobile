// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ReaderContext } from "./reader-context";
import { PrivateContentAccessProvider } from "./private-access";
import type { MessageContext } from "./media-policy";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children),
  ScrollView: ({ children }: PropsWithChildren) => h("main", null, children) }));
vi.mock("./primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("./tokens", () => ({ space: {} }));
const request = vi.fn(), context = { machineId: "original-machine", cwd: "/original/project", projectId: "original-project",
  client: { machine: { name: "Original computer", endpoint: "private-endpoint", lanKey: "private-key" }, request } } as unknown as MessageContext;
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
async function render(allowed = true, check = true, props: Partial<Parameters<typeof ReaderContext>[0]> = {}) {
  if (!root) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); }
  await act(async () => root!.render(h(PrivateContentAccessProvider, { value: { allowed, check: () => check } }, h(ReaderContext, { context, ...props }))));
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); request.mockClear(); });
it("shows the supplied original computer and full path without exposing transport credentials", async () => {
  const path = "/original/project/" + "long-folder/".repeat(30) + "file.txt";
  await render(true, true, { path }); expect(container.textContent).toBe("Original computer" + path);
  expect(container.textContent).not.toContain("private-endpoint"); expect(container.textContent).not.toContain("private-key"); expect(request).not.toHaveBeenCalled();
});
it.each([[false, true], [true, false]])("conceals both context fields when allowed=%s and current=%s", async (allowed, check) => {
  await render(); await render(allowed, check); expect(container.textContent).toBe("");
  await render(); expect(container.textContent).toBe("Original computer/original/project"); expect(request).not.toHaveBeenCalled();
});
it("keeps public readers free of invented computer context and uses the original identity when unnamed", async () => {
  await render(true, true, { context: undefined }); expect(container.textContent).toBe("");
  await render(true, true, { context: { ...context, client: { ...context.client, machine: { ...context.client.machine, name: "" } } } as unknown as MessageContext });
  expect(container.textContent).toBe("original-machine/original/project");
});
