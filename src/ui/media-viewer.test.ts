// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({error:()=>{},mounts:0,sharing:{share:vi.fn(),busy:false,error:new Error("Share failed"),reset:vi.fn()}}));
vi.mock("./use-media-sharing",()=>({useMediaSharing:()=>f.sharing}));
vi.mock("@/ui/theme",()=>({useMobileTheme:()=>{}}));vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));vi.mock("./tokens",()=>({colors:{},space:{}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("expo-image",async()=>{const {useEffect}=await import("react");return {Image:({onError}:{onError:()=>void})=>{f.error=onError;useEffect(()=>{f.mounts++;},[]);return createElement("div",null,"Synthetic image");}};});
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)},useSharedValue:(value:number)=>({value}),useAnimatedStyle:()=>({})}));
vi.mock("react-native-gesture-handler",()=>{const builder=()=>{const self={onUpdate:()=>self,onEnd:()=>self,numberOfTaps:()=>self};return self;};return {Gesture:{Pinch:builder,Pan:builder,Tap:builder,Simultaneous:()=>({})},GestureDetector:({children}:PropsWithChildren)=>children};});
vi.mock("./primitives",()=>({Row:({children}:PropsWithChildren)=>createElement("div",null,children),Button:({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label),ErrorText:({error}:{error:unknown})=>error?createElement("p",null,String(error)):null,Sheet:({visible,children,footer}:PropsWithChildren<{visible:boolean;footer:import("react").ReactNode}>)=>visible?createElement("main",null,children,footer):null}));
import { MediaViewer } from "./media-viewer";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement;
const render=(visible=true,uri="file:///image.png")=>act(async()=>root!.render(createElement(MediaViewer,{visible,uri,name:"Image",onClose:()=>{}})));
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.mounts=0;container=document.createElement("div");root=createRoot(container);});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;vi.unstubAllGlobals();});
it("retries the preview without clearing a separate sharing failure or accepting old image errors",async()=>{
 await render();const old=f.error;await act(async()=>old());expect(container.textContent).toContain("Preview could not be opened.");expect(container.textContent).toContain("Share failed");
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Retry")!.click());expect(f.mounts).toBe(2);expect(container.textContent).not.toContain("Preview could not be opened.");expect(container.textContent).toContain("Share failed");
 await act(async()=>old());expect(container.textContent).not.toContain("Preview could not be opened.");await act(async()=>f.error());expect(container.textContent).toContain("Preview could not be opened.");
});
it("starts a new preview owner when reopening the same URI",async()=>{
 await render();await act(async()=>f.error());await render(false);await render();expect(container.textContent).not.toContain("Preview could not be opened.");expect(f.mounts).toBe(2);
});
it("keeps non-file images out of local share/save presentation",async()=>{
 await render(true,"https://synthetic.invalid/image.png");expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Share / save")).toBe(false);
});
