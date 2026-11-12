// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ permission: { granted: true, canAskAgain: true, status: "granted" } as { granted: boolean; canAskAgain: boolean; status: string } | null,
  refresh: vi.fn(), request: vi.fn(), focused: true, unlocked: true, camera: null as null | { onBarcodeScanned?: (result: {data: string}) => void; onMountError: () => void },
  listeners: new Map<string, Set<(state: string) => void>>(), close: vi.fn(), paste: vi.fn(), code: vi.fn(), settings: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/tokens", () => ({ colors: {}, radii: {}, space: {}, metrics: { entryWidth: 440 } }));
vi.mock("@/state/security", () => ({ useSecurity: (selector: (value: unknown) => unknown) => selector({ status: fixture.unlocked ? "unlocked" : "locked" }) }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => fixture.focused }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/chevron-left", () => ({ default: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({children}: PropsWithChildren) => createElement("div", null, children) } }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({width:320,height:640}),
  View: ({children}: PropsWithChildren) => createElement("div", null, children), StyleSheet: { absoluteFill: {} }, Linking: { openSettings: fixture.settings },
  AppState: { currentState: "active", addEventListener: (kind: string, callback: (state: string) => void) => { const set=fixture.listeners.get(kind)??new Set(); set.add(callback); fixture.listeners.set(kind,set); return {remove:()=>set.delete(callback)}; } },
  BackHandler: { addEventListener: (_kind: string, callback: () => void) => { const set=fixture.listeners.get("back")??new Set();set.add(callback);fixture.listeners.set("back",set);return {remove:()=>set.delete(callback)}; } },
}));
vi.mock("expo-camera", () => ({ useCameraPermissions: () => [fixture.permission,fixture.request,fixture.refresh], CameraView: (props: typeof fixture.camera) => {fixture.camera=props;return createElement("div",null,"Synthetic camera");} }));
vi.mock("@/ui/primitives", () => {
  const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);
  const Button=({label,onPress,disabled}:{label:string;onPress:()=>void;disabled?:boolean})=>createElement("button",{onClick:onPress,disabled},label);
  return { Body:Wrapper, Notice:({message}:{message:string})=>createElement("p",null,message), Screen:({children,footer}:PropsWithChildren<{footer?:import("react").ReactNode}>)=>createElement("main",null,children,footer), IconButton:Button, HeaderBackButton:({onPress}:{onPress:()=>void})=>createElement("button",{onClick:onPress},"Geri"), Button,
    Loading:({label}:{label:string})=>createElement("p",null,label),
    MutationState:({mutation}:{mutation:{error?:Error}})=>mutation.error?createElement("p",null,mutation.error.message):null,
    ErrorNotice:({error,onRetry,retryLabel}:{error?:Error|string;onRetry?:()=>void;retryLabel?:string})=>error?createElement("div",null,createElement("p",null,error instanceof Error?error.message:error),onRetry?createElement(Button,{label:retryLabel??"Retry",onPress:onRetry}):null):null,
  };
});
import { PairingScanner } from "./pairing-scanner";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement,client:QueryClient;
const render=()=>act(async()=>root!.render(createElement(QueryClientProvider,{client},createElement(PairingScanner,{onCode:fixture.code,onClose:fixture.close,onPaste:fixture.paste}))));
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
const click=async(label:string)=>act(async()=>{const button=[...container.querySelectorAll("button")].find(b=>b.textContent===label);expect(button).toBeDefined();button!.click();});
const event=async(kind:string,state="")=>act(async()=>fixture.listeners.get(kind)?.forEach(callback=>callback(state)));
beforeEach(async()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubEnv("EXPO_OS","android");fixture.focused=true;fixture.unlocked=true;fixture.permission={granted:true,canAskAgain:true,status:"granted"};fixture.refresh.mockImplementation(async()=>fixture.permission);fixture.request.mockResolvedValue(fixture.permission);fixture.code.mockRejectedValue(new Error("Invalid pairing QR"));container=document.createElement("div");root=createRoot(container);client=new QueryClient();});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;client.clear();fixture.listeners.clear();fixture.camera=null;vi.resetAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("pauses after one rejected QR and scans again only after explicit retry",async()=>{
 await render();await settle();const old=fixture.camera!.onBarcodeScanned!;
 await act(async()=>{old({data:"bad"});old({data:"bad"});});await settle();
 expect(fixture.code).toHaveBeenCalledTimes(1);expect(container.textContent).toContain("Invalid pairing QR");expect(container.textContent).not.toContain("Synthetic camera");
 await act(async()=>old({data:"bad"}));await settle();expect(fixture.code).toHaveBeenCalledTimes(1);
 await click("Scan again");await settle();expect(container.textContent).not.toContain("Invalid pairing QR");
 await act(async()=>fixture.camera!.onBarcodeScanned!({data:"next"}));await settle();expect(fixture.code).toHaveBeenCalledTimes(2);
});
it.each(["change","blur","locked","unfocused","unmounted"])("does not request permission after a delayed read loses %s ownership",async reason=>{
 fixture.permission=null;let resolve!:(value:unknown)=>void;fixture.refresh.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 await render();
 if(reason==="change")await event("change","background");if(reason==="blur")await event("blur");
 if(reason==="locked"){fixture.unlocked=false;await render();}if(reason==="unfocused"){fixture.focused=false;await render();}
 if(reason==="unmounted"){await act(async()=>root!.unmount());root=undefined;}
 await act(async()=>resolve({granted:false,canAskAgain:true,status:"undetermined"}));await settle();expect(fixture.request).not.toHaveBeenCalled();
});
it("replaces initial camera loading with actionable permission-read recovery",async()=>{
 fixture.permission=null;fixture.refresh.mockRejectedValueOnce(new Error("Permission read failed"));await render();await settle();
 expect(container.textContent).toContain("Permission read failed");expect(container.textContent).not.toContain("Preparing camera…");
 fixture.permission={granted:true,canAskAgain:true,status:"granted"};await click("Retry");await settle();expect(fixture.refresh).toHaveBeenCalledTimes(2);expect(fixture.request).not.toHaveBeenCalled();
});
it.each(["back","paste","blur"])("ignores an already-delivered barcode handler after %s",async reason=>{
 await render();await settle();const old=fixture.camera!.onBarcodeScanned!;
 if(reason==="paste")await click("Paste instead");else await event(reason);
 await act(async()=>old({data:"late"}));await settle();expect(fixture.code).not.toHaveBeenCalled();
});

it("rejects events from the previous camera after blur and return",async()=>{
 await render();await settle();const old=fixture.camera!.onBarcodeScanned!;
 await event("blur");await event("focus");await settle();
 await act(async()=>old({data:"old-frame"}));await settle();expect(fixture.code).not.toHaveBeenCalled();
 await act(async()=>fixture.camera!.onBarcodeScanned!({data:"new-frame"}));await settle();expect(fixture.code).toHaveBeenCalledExactlyOnceWith("new-frame");
});
it("does not duplicate a successful code before its parent finishes navigation",async()=>{
 fixture.code.mockResolvedValue(undefined);await render();await settle();const old=fixture.camera!.onBarcodeScanned!;
 await act(async()=>old({data:"accepted"}));await settle();await act(async()=>old({data:"accepted"}));await settle();expect(fixture.code).toHaveBeenCalledExactlyOnceWith("accepted");
});

it("retires the physical camera even when blur and focus updates are batched",async()=>{
 await render();await settle();const old=fixture.camera!.onBarcodeScanned!;
 await act(async()=>{fixture.listeners.get("blur")?.forEach(fn=>fn(""));fixture.listeners.get("focus")?.forEach(fn=>fn(""));});await settle();
 await act(async()=>old({data:"old-frame"}));await settle();expect(fixture.code).not.toHaveBeenCalled();
 await act(async()=>fixture.camera!.onBarcodeScanned!({data:"new-frame"}));await settle();expect(fixture.code).toHaveBeenCalledExactlyOnceWith("new-frame");
});
