// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { SessionSheetAction } from "./session-action-list";

const state = vi.hoisted(() => ({ actions: [] as SessionSheetAction[], prepare: undefined as (() => Promise<string>) | undefined }));
vi.mock("react-native", () => ({ Share: { share: vi.fn().mockResolvedValue({ action: "sharedAction" }) } }));
vi.mock("lucide-react-native/icons/share", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/link", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/messages-square", () => ({ default: () => null }));
vi.mock("@/state/actions", async () => {
  const { createSingleFlight } = await import("@/state/single-flight");
  return { useSingleFlight: () => createSingleFlight() };
});
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({ ErrorText: () => null }));
vi.mock("@/ui/use-clipboard-feedback", () => ({
  useClipboardFeedback: (_payload: string, _enabled: boolean, _flight: unknown, prepare?: () => Promise<string>) => {
    if (prepare) state.prepare = prepare;
    return { copy() {}, inFlight: false, busy: false, copied: false, error: null };
  },
}));
vi.mock("./session-action-list", () => ({ SessionActionList: ({ actions }: { actions: SessionSheetAction[] }) => { state.actions = actions; return null; } }));
import { SessionRowCopyMenu } from "./session-row-copy-menu";
import { Share } from "react-native";

let root: ReturnType<typeof createRoot> | undefined;
let node: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); node?.remove(); root = undefined; vi.unstubAllGlobals(); });

it("orders all groups and reads full conversation only on explicit copy", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); root = createRoot(node);
  let current = true;
  const request = vi.fn().mockResolvedValue({ projectId: "p", session: { id: "s", blocks: [{ role: "user", text: "Hello" }] } });
  await act(() => root!.render(createElement(SessionRowCopyMenu, {
    sessionId: "s", projectId: "p", title: "Title", link: "bycoda://session/v1/host/h/s", client: { request }, current: () => current, busy: false,
    actions: ["delete", "stop", "archive", "settle", "details", "pin", "rename"].map(key => ({ key, label: key, onPress() {} })),
  })));
  expect(state.actions.map(action => action.key)).toEqual(["rename", "pin", "copy-link", "share", "copy-id", "copy-conversation", "details", "settle", "archive", "stop", "delete"]);
  expect(request).not.toHaveBeenCalled();
  await act(async () => state.actions.find(action => action.key === "share")!.onPress());
  expect(Share.share).toHaveBeenCalledExactlyOnceWith({ title: "Title", message: "Title\nbycoda://session/v1/host/h/s" });
  await expect(state.prepare!()).resolves.toBe("User: Hello");
  expect(request).toHaveBeenCalledExactlyOnceWith("sessions.get", { sessionId: "s" });
  request.mockResolvedValueOnce({ projectId: "other", session: { id: "s", blocks: [] } });
  await expect(state.prepare!()).rejects.toThrow("no longer available");
  request.mockImplementationOnce(async () => { current = false; return { projectId: "p", session: { id: "s", blocks: [] } }; });
  await expect(state.prepare!()).rejects.toThrow("no longer available");
  request.mockClear();
  await expect(state.prepare!()).rejects.toThrow("no longer available");
  expect(request).not.toHaveBeenCalled();
});
