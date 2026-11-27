// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ store: undefined as any, uuid: 0,
  writes: [] as Array<{ method: string; params: any }>, confirm: undefined as any, home: undefined as any,
  editText: undefined as any, finishBoot: undefined as any, onDevice: vi.fn(),
  editUrl: undefined as any, claim: vi.fn(async () => {}), clear: vi.fn(async () => {}),
  frameAccess: undefined as any,
}));
vi.mock("@/ui/duotone-icon", () => ({ Server: () => null, Smartphone: () => null }));
vi.mock("lucide-react-native/icons/wrench", () => ({ default: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/state/data-saver", () => ({ useDataSaverActive: () => false }));
vi.mock("expo-crypto", () => ({ randomUUID: () => String(++f.uuid) }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create<any>(() => ({ activeId: "machine", machines: [] })); f.store = useMachines;
  return { useMachines, useActiveMachine: () => useMachines((s: any) => s.machines.find((m: any) => m.id === s.activeId)) };
});
vi.mock("react-native", () => ({ View: ({ children }: { children?: unknown }) => children as never }));
vi.mock("@/ui/overflow-menu", () => ({ ActionMenu: ({ actions }: any) => createElement("div", null, actions.map((a: any) => createElement("button", { key: a.key, disabled: a.disabled, onClick: a.onPress }, a.label))) }));
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/app-window", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/layers", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/rotate-cw", () => ({ default: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/house", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("@/ui/copy",() => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {}, space: {}, gapIcon: 8 }));
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: () => null }));
const device = { id: "device", name: "Device", platform: "android" as const, version: "16", physical: false, booted: true };
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string) => ({ isSuccess: true, isFetching: false, refetch: vi.fn(async () => {}),
    data: method === "devices.preflight" ? { checks: { sdk: true, device: true, tools: true, agentControl: true } }
      : method === "devices.status" ? { installed: true, running: false, agentInstalled: true, platforms: [] }
      : method === "devices.preview.impact" ? { activeCount: 0, owned: [], otherActiveCount: 0 }
      : method === "devices.list" ? { devices: [device], errors: [] }
      : method === "devices.preview.mobile.status" ? undefined : { mime: "image/png", base64: "YWJj" },
  }),
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: (params: any) => {
    f.writes.push({ method, params });
    return method === "devices.boot" ? new Promise(resolve => { f.finishBoot = resolve; }) : Promise.resolve({});
  } }),
}));
vi.mock("./device-preview-intent", () => ({ loadPreviewIntent: async () => null, claimPreviewIntent: f.claim,
  clearPreviewIntent: f.clear, discardInvalidPreviewIntent: async () => {}, isInvalidPreviewIntentError: () => false }));
vi.mock("@/ui/remote-frame", async () => {
  const { usePrivateContentAccess } = await import("@/ui/private-access");
  return { RemoteFrame: () => { f.frameAccess = usePrivateContentAccess(); return createElement("div", { "data-frame": true }, "Device frame"); } };
});
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: any) => { if (label === "Home") f.home = onPress; return createElement("button", { onClick: onPress, disabled }, label); };
  return { ChoiceChip: () => null, StatusLine: () => null, ScopeLine: () => null, RowIcon: () => null, StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children), Body: Wrap, Row: Wrap, Stack: Wrap, Sheet: ({children,onClose,footer}:any)=>createElement("div",null,children,footer,createElement(Button,{label:"Close",onPress:onClose})), Disclosure: Wrap, NavigationGroup: Wrap,
    Badge: () => null, StatusText: () => null, StateView: ({ title, description }: any) => createElement("p", null, title, description), Notice: () => null, MutationState: () => null, QueryState: () => null, ErrorText: () => null, Loading: () => null,
    Button, IconButton: Button, NavigationRow: Button,
    FormActions: ({onSubmit,submitLabel}:any) => { f.confirm = onSubmit; return createElement(Button,{label:submitLabel,onPress:onSubmit}); },
    ToggleField: ({label,value,onChange}:any) => createElement(Button,{label,onPress:()=>onChange(!value)}),
    Field: ({label,value,onChangeText}:any) => { if(label==="Text")f.editText=onChangeText;if(label==="Development server URL")f.editUrl=onChangeText;return createElement("input",{"aria-label":label,value:value??"",onChange:(e:any)=>onChangeText(e.target.value)}); },
    SearchField: ({label,value,onChangeText}:any) => createElement("input",{"aria-label":label,value,onChange:(e:any)=>onChangeText(e.target.value)}),
    useCollapsibleSearch: (field: unknown) => ({ open: true, trigger: null, field }),
    ActionMenu: ({actions}:any) => createElement("div",null,actions.map((a:any)=>createElement(Button,{key:a.key,label:a.label,onPress:a.onPress}))),
    ScreenList: ({actions,header,data,renderItem}:any) => createElement("div",null,actions,header,data.map((item:any)=>createElement("div",{key:item.id},renderItem({item})))),
  };
});
import { DeviceRuntime } from "./device-runtime";
import { DeviceViewer } from "./device-viewer";
import { DevicesScreen } from "./devices-screen";
import { DevicePreviewSheet } from "./device-preview";
let root: Root, node: HTMLDivElement;
async function render(value: any) { await act(async () => root.render(value)); }
async function click(label: string) { const button=[...node.querySelectorAll("button")].find(b=>b.textContent===label);expect(button).toBeTruthy();await act(async()=>button!.click()); }
async function aba(field: string, invoke?: () => void) {
  const state=f.store.getState(),machine=state.machines[0];
  await act(async()=>{ f.store.setState(field==="activeId"?{activeId:"other"}:{machines:[{...machine,[field]:"temporary"}]});f.store.setState({activeId:state.activeId,machines:[machine]});invoke?.(); });
}
beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.writes=[];f.onDevice.mockClear();f.confirm=undefined;f.home=undefined;f.finishBoot=undefined;
  f.claim.mockReset().mockResolvedValue(undefined);f.clear.mockReset().mockResolvedValue(undefined);
  f.store.setState({activeId:"machine",machines:[{id:"machine",name:"Computer",endpoint:"https://a.invalid",environmentId:"env",lanKey:"key",capabilities:["device.host","devices.preview.mobile.v1"]}]});
  node=document.createElement("div");root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});

it.each(["endpoint","lanKey","environmentId","activeId"])("retires service confirmation after batched %s A/B/A but permits a newly reviewed window",async field=>{
  await render(createElement(DeviceRuntime,{projectId:"project",onClose:vi.fn()}));await click("Start device service");const old=f.confirm;
  await aba(field,old);expect(f.writes).toEqual([]);
  await render(createElement(DeviceRuntime,{key:"fresh",projectId:"project",onClose:vi.fn()}));await click("Start device service");await act(async()=>f.confirm());
  expect(f.writes).toEqual([{method:"devices.start",params:{projectId:"project"}}]);
});
it("rejects a captured device-control callback after credential A/B/A",async()=>{
  await render(createElement(DeviceViewer,{projectId:"project",device,canControl:true,onDevice:f.onDevice,onClose:vi.fn()}));const old=f.home;
  await aba("lanKey",old);expect(f.writes).toEqual([]);
});
it("rejects late boot completion after endpoint A/B/A",async()=>{
  await render(createElement(DeviceViewer,{projectId:"project",device:{...device,booted:false},canControl:true,onDevice:f.onDevice,onClose:vi.fn()}));await click("Boot device");
  await aba("endpoint");await act(async()=>f.finishBoot({...device,id:"late-device"}));expect(f.onDevice).not.toHaveBeenCalled();
});
it("retains viewer input for name churn and closes the old viewer for connection A/B/A",async()=>{
  await render(createElement(DevicesScreen,{project:{id:"project",name:"Project",cwd:"/project"}as any}));await click("Device");await click("Type text");await act(async()=>f.editText("Retained device text"));
  const input=node.querySelector('input[aria-label="Text"]')!;
  const access=f.frameAccess;
  await act(async()=>{const machine=f.store.getState().machines[0];f.store.setState({machines:[{...machine,name:"Renamed"}]});});
  expect(node.querySelector('input[aria-label="Text"]')).toBe(input);expect((input as HTMLInputElement).value).toBe("Retained device text");
  expect(f.frameAccess).toBe(access);expect(access.check()).toBe(true);
  await aba("endpoint");expect(node.querySelector("[data-frame]")).toBeNull();expect(access.check()).toBe(false);
});

it("keeps normal close animation access but revokes that retained portal lease on connection change",async()=>{
  await render(createElement(DevicesScreen,{project:{id:"project",name:"Project",cwd:"/project"}as any}));await click("Device");
  const access=f.frameAccess;await click("Close");expect(access.check()).toBe(true);
  await aba("endpoint");expect(access.check()).toBe(false);
});

async function reviewPreview() {
  await render(createElement(DevicePreviewSheet,{projectId:"project",device,onClose:vi.fn()}));
  await act(async()=>f.editUrl("exp://127.0.0.1:8081"));await click("Review preview");
}
it("rejects a preview confirmation before it can claim storage after endpoint A/B/A",async()=>{
  await reviewPreview();const old=f.confirm;await aba("endpoint",old);
  expect(f.claim).not.toHaveBeenCalled();expect(f.writes).toEqual([]);
});
it("cleans a previously authorized preview claim without launching after credential A/B/A",async()=>{
  let finish!:()=>void;f.claim.mockReturnValueOnce(new Promise<void>(resolve=>{finish=resolve;}));
  await reviewPreview();await act(async()=>f.confirm());expect(f.claim).toHaveBeenCalledOnce();
  await aba("lanKey");await act(async()=>finish());expect(f.writes).toEqual([]);expect(f.clear).toHaveBeenCalledOnce();
});
