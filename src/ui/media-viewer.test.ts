// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
vi.mock("expo-file-system",()=>({File:class{size=1}}));vi.mock("expo-clipboard",()=>({setImageAsync:async()=>{}}));
const f=vi.hoisted(()=>({error:()=>{},mounts:0,uri:"",rotate:vi.fn(),save:vi.fn(),load:()=>{},sharing:{share:vi.fn(),busy:false,error:new Error("Share failed"),reset:vi.fn()}}));
vi.mock("./use-media-sharing",()=>({useMediaSharing:()=>f.sharing}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));vi.mock("./tokens",()=>({colors:{},space:{}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("expo-image",async()=>{const {useEffect}=await import("react");return {Image:({onError,onLoad,source}:{onError:()=>void;onLoad?:(e:unknown)=>void;source:{uri:string}})=>{f.error=onError;f.load=()=>onLoad?.({source:{width:100,height:50}});f.uri=source.uri;useEffect(()=>{f.mounts++;},[]);return createElement("div",null,"Synthetic image");}};});
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)},useSharedValue:(value:number)=>({value}),useAnimatedStyle:()=>({})}));
vi.mock("react-native-gesture-handler",()=>{const builder=()=>{const self={onUpdate:()=>self,onEnd:()=>self,numberOfTaps:()=>self};return self;};return {Gesture:{Pinch:builder,Pan:builder,Tap:builder,Simultaneous:()=>({})},GestureDetector:({children}:PropsWithChildren)=>children};});
vi.mock("./primitives",()=>{const Btn=({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label);return {Body:({children}:PropsWithChildren)=>createElement("p",null,children),Button:Btn,IconButton:Btn,ErrorText:({error}:{error:unknown})=>error?createElement("p",null,String(error)):null};});
vi.mock("./overlays",()=>({ScreenOverlay:({visible,children}:PropsWithChildren<{visible:boolean}>)=>visible?createElement("main",null,children):null}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
vi.mock("lucide-react-native/icons/x",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/share-2",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/copy",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/paperclip",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/download",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/crop",()=>({default:()=>null}));
vi.mock("./media-orientation",()=>({useRotatableScreen:f.rotate}));vi.mock("./media-save",()=>({useSaveToPhotos:()=>({save:f.save,busy:false,error:null})}));
vi.mock("./media-crop-overlay",()=>({MediaCropOverlay:({onApply}:{onApply(u:string):void})=>createElement("button",{onClick:()=>onApply("file:///crop.png")},"Apply crop")}));
vi.mock("./reader-context",()=>({ReaderContext:()=>null}));
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
 await render(true,"https://synthetic.invalid/image.png");expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Share")).toBe(false);
});
it("is a bare viewer: top-bar actions, no name or path text, reference hand-off closes it",async()=>{
 const used=vi.fn(),closed=vi.fn();
 await act(async()=>root!.render(createElement(MediaViewer,{visible:true,uri:"file:///cache/secret-path/image.png",name:"secret-path/image.png",onClose:closed,onUseAsReference:used})));
 const labels=[...container.querySelectorAll("button")].map(b=>b.textContent);
 expect(labels).toEqual(expect.arrayContaining(["Close","Save to Photos","Share","Copy","Use as reference"]));
 expect(container.textContent).not.toContain("secret-path");
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Use as reference")!.click());
 expect(used).toHaveBeenCalledWith({uri:"file:///cache/secret-path/image.png",name:"secret-path/image.png"});expect(closed).toHaveBeenCalledOnce();
});
it("offers no reference action without a host handler",async()=>{
 await render();expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Use as reference")).toBe(false);
});
it("unlocks rotation while visible and saves to Photos",async()=>{
 await render();expect(f.rotate).toHaveBeenCalledWith(true);
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Save to Photos")!.click());expect(f.save).toHaveBeenCalledOnce();
});
it("offers crop once the size is known and shows the cropped result",async()=>{
 await render();expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Crop")).toBe(false);
 await act(async()=>f.load());await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Crop")!.click());
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Apply crop")!.click());expect(f.uri).toBe("file:///crop.png");
});
