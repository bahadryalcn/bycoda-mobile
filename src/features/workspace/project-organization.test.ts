// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectOrganization } from "./project-organization";
const f = vi.hoisted(() => ({ activeId: "machine", raw: null as string | null, private: false, sends: [] as Record<string, unknown>[], snapshot: { environmentId: "env", sourceSessionId: "source", projectCwd: "/private-project", workingCwd: "/private-project", revision: "a".repeat(64), atomic: false, name: "Private project label", customName: "", groupId: null, groups: [], projectPosition: 0, projectCount: 1, folders: [], sessions: [{ id: "s1", title: "First" }], order: {} } as Record<string, unknown> }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-down", () => ({ default: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "operation" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => f.raw, setItem: async (_key: string, value: string) => { f.raw = value; }, removeItem: async () => { f.raw = null; } } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name: "Computer", environmentId: "env", capabilities: ["projects.organization.desktop.v1"] }), useMachines: { getState: () => ({ activeId: f.activeId, machines: [{ id: "machine", environmentId: "env" }] }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutateAsync: async (params: Record<string, unknown>) => { expect(f.raw).toContain('"operationId":"operation"'); f.sends.push(params); f.snapshot = { ...f.snapshot, name: (params.change as { name: string }).name, customName: (params.change as { name: string }).name, revision: "b".repeat(64) }; return { state: "applied", snapshot: f.snapshot }; } }), useHostQuery: (key: string[]) => key[0] === "project-organization" ? { data: f.snapshot, isError: f.private, error: f.private ? new Error("private") : null, refetch: async () => ({ data: f.snapshot }), isFetching: false } : { data: { state: "unknown" }, refetch: async () => ({ data: { state: "unknown" } }), isFetching: false } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
 const box = ({ children }: PropsWithChildren) => createElement("div", null, children); const button = ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
 return { Body: box, Stack: box, Row: box, NavigationGroup: box, Sheet: ({ children, visible }: PropsWithChildren<{ visible: boolean }>) => visible ? createElement("div", null, children) : null, Notice: ({ message }: { message: string }) => createElement("p", null, message), StateView: ({ title }: { title: string }) => createElement("p", null, title), QueryState: () => null, ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", null, String(error)) : null,
  ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: unknown; renderItem: (input: { item: unknown; index: number }) => unknown }) => createElement("div", null, header as never, ...data.map((item, index) => renderItem({ item, index }) as never)),
  Button: button, IconButton: button, NavigationRow: button, FormActions: ({ submitLabel, disabled, onSubmit }: { submitLabel: string; disabled: boolean; onSubmit: () => void }) => button({ label: submitLabel, disabled, onPress: onSubmit }),
  Field: ({ label, value, editable, onChangeText }: { label: string; value: string; editable: boolean; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, disabled: !editable, onChange: (event) => onChangeText(event.currentTarget.value) }), SelectField: () => null, MultiSelectField: () => null };
});
const container = document.createElement("div"); let root: ReturnType<typeof createRoot>;
const props = { scope: { machineId: "machine", sessionId: "source" }, projectId: "project", onClose: vi.fn() };
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container); await act(async () => root.render(createElement(ProjectOrganization, props))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function edit(value: string) { await act(async () => { const input = container.querySelector('input[aria-label="Display name"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }); }
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); f.raw = null; f.activeId = "machine"; f.private = false; f.sends = []; f.snapshot = { ...f.snapshot, name: "Private project label", customName: "", revision: "a".repeat(64) }; });
it("opening is read-only and an explicit save claims one operation before the canonical patch", async () => {
 await mount(); expect(f.sends).toEqual([]); await click("Project display name"); await edit("Reviewed label"); await click("Save organization change");
 expect(f.sends).toHaveLength(1); expect(f.sends[0]).toMatchObject({ projectId: "project", sessionId: "source", expectedRevision: "a".repeat(64), operationId: "operation", change: { kind: "projectName", name: "Reviewed label" } }); expect(f.raw).toBeNull();
});
it("restored unknown operations permit status reads without another edit or send", async () => {
 f.raw = JSON.stringify({ operationId: "previous", environmentId: "env", digest: "a".repeat(64) }); await mount();
 expect(container.textContent).toContain("Checking status does not resend"); expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Project display name")?.disabled).toBe(true); expect(f.sends).toEqual([]);
});
it("privacy errors hide an already opened editor", async () => {
 await mount(); await click("Project display name"); await edit("Unsaved private label"); f.private = true; await act(async () => root.render(createElement(ProjectOrganization, props)));
 expect(container.querySelector("input")).toBeNull(); expect(container.textContent).not.toContain("/private-project"); expect(f.sends).toEqual([]);
});
it("switching computers before saving cannot create an operation or write its draft", async () => {
 await mount(); await click("Project display name"); await edit("Unsaved label"); f.activeId = "other"; await click("Save organization change"); expect(f.raw).toBeNull(); expect(f.sends).toEqual([]);
});
