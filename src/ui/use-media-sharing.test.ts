// @vitest-environment jsdom
import { act,createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({available:vi.fn(),share:vi.fn(),allowed:true,state:{appState:"active",windowFocused:true},listeners:new Set<()=>void>()}));
vi.mock("expo-sharing",()=>({isAvailableAsync:f.available,shareAsync:f.share}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>f.allowed,useSecurity:{getState:()=>f.state,subscribe:(listener:()=>void)=>{f.listeners.add(listener);return()=>f.listeners.delete(listener);}}}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
import { useMediaSharing } from "./use-media-sharing";
let api:ReturnType<typeof useMediaSharing>,root:ReturnType<typeof createRoot>|undefined;
function Harness(props:Parameters<typeof useMediaSharing>[0]){api=useMediaSharing(props);return null;}
const render=(uri="file:///a.pdf",enabled=true,name=uri,mimeType:string|null="application/pdf")=>act(async()=>root!.render(createElement(Harness,{uri,name,mimeType:mimeType??undefined,enabled})));
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.allowed=true;f.state={appState:"active",windowFocused:true};f.available.mockResolvedValue(true);f.share.mockResolvedValue(undefined);root=createRoot(document.createElement("div"));});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;f.listeners.clear();vi.resetAllMocks();vi.unstubAllGlobals();});
it("claims one handoff before availability resolves and exposes truthful pending state",async()=>{
 let done!:(value:boolean)=>void;f.available.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();await act(async()=>{api.share();api.share();});expect(f.available).toHaveBeenCalledTimes(1);expect(api.busy).toBe(true);expect(f.share).not.toHaveBeenCalled();
 await act(async()=>done(true));expect(f.share).toHaveBeenCalledExactlyOnceWith("file:///a.pdf",{dialogTitle:"file:///a.pdf",displayName:"file:///a.pdf",mimeType:"application/pdf"});expect(api.busy).toBe(false);expect(api.error).toBeNull();
});

it("shares a staged document with its visible name and MIME without changing the source URI",async()=>{
 await render("file:///attachment-store/f996170e",true,"İstanbul bütçe.pdf");
 await act(async()=>api.share());
 expect(f.share).toHaveBeenCalledExactlyOnceWith("file:///attachment-store/f996170e",{
   dialogTitle:"İstanbul bütçe.pdf",displayName:"İstanbul bütçe.pdf",mimeType:"application/pdf"
 });
});

it("leaves filename resolution to the current source when the MIME is unknown",async()=>{
 await render("file:///crop.png",true,"original.jpeg",null);
 await act(async()=>api.share());
 expect(f.share).toHaveBeenCalledExactlyOnceWith("file:///crop.png",{dialogTitle:"original.jpeg"});
});
it("retires old file callbacks without blocking a new explicitly chosen file",async()=>{
 let done!:(value:boolean)=>void;f.available.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();const old=api.share;await act(async()=>old());await render("file:///b.pdf");await act(async()=>{old();api.share();});await settle();
 expect(f.available).toHaveBeenCalledTimes(2);expect(f.share).toHaveBeenCalledExactlyOnceWith("file:///b.pdf",expect.anything());await act(async()=>done(true));expect(f.share).toHaveBeenCalledTimes(1);expect(api.error).toBeNull();
});
it("does not open after closing/reopening the same reader",async()=>{
 let done!:(value:boolean)=>void;f.available.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();const old=api.share;await act(async()=>old());await render("file:///a.pdf",false);await render();await act(async()=>{done(true);old();});await settle();expect(f.share).not.toHaveBeenCalled();
 await act(async()=>api.share());expect(f.share).toHaveBeenCalledTimes(1);
});
it("does not open after unmount",async()=>{
 let done!:(value:boolean)=>void;f.available.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();const old=api.share;await act(async()=>old());await act(async()=>root!.unmount());root=undefined;await act(async()=>{done(true);old();});await settle();expect(f.share).not.toHaveBeenCalled();
});
it.each(["lock","background","blur"])("does not revive a pending handoff after %s and return",async reason=>{
 let done!:(value:boolean)=>void;f.available.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();await act(async()=>api.share());
 await act(async()=>{if(reason==="lock")f.allowed=false;if(reason==="background")f.state.appState="background";if(reason==="blur")f.state.windowFocused=false;f.listeners.forEach(fn=>fn());f.allowed=true;f.state={appState:"active",windowFocused:true};f.listeners.forEach(fn=>fn());done(true);});expect(f.share).not.toHaveBeenCalled();
 await act(async()=>api.share());expect(f.share).toHaveBeenCalledTimes(1);
});
it("retains a local sharing error for retry and clears it for another file",async()=>{
 f.available.mockResolvedValueOnce(false);await render();await act(async()=>api.share());expect(String(api.error)).toContain("Sharing is unavailable");
 f.share.mockRejectedValueOnce(new Error("Evicted file"));await act(async()=>api.share());expect(String(api.error)).toContain("Evicted file");
 await render("file:///b.pdf");expect(api.error).toBeNull();await act(async()=>api.share());expect(api.error).toBeNull();
});
it("ignores a late failure from a handoff already opened for a previous file",async()=>{
 let fail!:(error:Error)=>void;f.share.mockImplementationOnce(()=>new Promise((_done,reject)=>{fail=reject;}));await render();await act(async()=>api.share());expect(f.share).toHaveBeenCalledTimes(1);
 await render("file:///b.pdf");await act(async()=>fail(new Error("Old share failed")));expect(api.error).toBeNull();expect(api.busy).toBe(false);
});
it("does not check availability when closed or access is unavailable",async()=>{
 await render("file:///a.pdf",false);await act(async()=>api.share());f.allowed=false;await render();await act(async()=>api.share());expect(f.available).not.toHaveBeenCalled();
});

it("does not let an old reader reset the next file's sharing feedback",async()=>{
 f.share.mockRejectedValue(new Error("Share failed"));await render();const oldReset=api.reset;await render("file:///b.pdf");await act(async()=>api.share());
 await act(async()=>expect(oldReset()).toBe(false));expect(String(api.error)).toContain("Share failed");
 await act(async()=>expect(api.reset()).toBe(true));expect(api.error).toBeNull();
});
