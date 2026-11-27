// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
vi.mock("expo-file-system",()=>({File:class{size=1}}));vi.mock("expo-clipboard",()=>({setImageAsync:async()=>{}}));
const f=vi.hoisted(()=>({a11y:undefined as undefined|((e:unknown)=>void),error:()=>{},mounts:0,mounted:[] as string[],width:0,uri:"",rotate:vi.fn(),save:vi.fn(),load:()=>{},sharing:{share:vi.fn(),busy:false,error:new Error("Share failed"),reset:vi.fn()}}));
vi.mock("./use-media-sharing",()=>({useMediaSharing:()=>f.sharing}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));vi.mock("./tokens",()=>({colors:{},space:{},radii:{},metrics:{visualControl:32}}));vi.mock("./error-message",()=>({errorMessage:(error:unknown)=>error instanceof Error?error.message:String(error)}));
vi.mock("react-native",async()=>{const {useEffect}=await import("react");return {View:({children,onAccessibilityAction,onLayout,accessibilityRole}:PropsWithChildren<{onAccessibilityAction?:(e:unknown)=>void;onLayout?:(e:unknown)=>void;accessibilityRole?:string}>)=>{if(onAccessibilityAction)f.a11y=onAccessibilityAction;useEffect(()=>{if(f.width&&onLayout)onLayout({nativeEvent:{layout:{width:f.width,height:800}}});},[]);return createElement("div",accessibilityRole?{"data-role":accessibilityRole}:null,children);}};});
vi.mock("expo-image",async()=>{const {useEffect}=await import("react");return {Image:({onError,onLoad,source}:{onError:()=>void;onLoad?:(e:unknown)=>void;source:{uri:string}})=>{f.error=onError;f.load=()=>onLoad?.({source:{width:100,height:50}});f.uri=source.uri;useEffect(()=>{f.mounts++;f.mounted.push(source.uri);},[]);return createElement("div",null,"Synthetic image");}};});
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)},useSharedValue:(value:number)=>({value}),useAnimatedStyle:()=>({}),withTiming:(value:number)=>value}));vi.mock("react-native-worklets",()=>({scheduleOnRN:(fn:(...a:unknown[])=>void,...args:unknown[])=>fn(...args)}));
vi.mock("react-native-gesture-handler",()=>{const builder=()=>{const self={onStart:()=>self,onUpdate:()=>self,onEnd:()=>self,onFinalize:()=>self,numberOfTaps:()=>self};return self;};return {Gesture:{Pinch:builder,Pan:builder,Tap:builder,Simultaneous:()=>({})},GestureDetector:({children}:PropsWithChildren)=>children};});
vi.mock("./primitives",()=>{const Btn=({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label);return {Body:({children}:PropsWithChildren)=>createElement("span",null,children),IconButton:Btn,StatusLine:({label,action}:{label:string;action?:{label:string;onPress:()=>void}})=>createElement("p",null,label,action?Btn(action):null)};});
vi.mock("./overlays",()=>({ScreenOverlay:({visible,children}:PropsWithChildren<{visible:boolean}>)=>visible?createElement("main",null,children):null}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
vi.mock("lucide-react-native/icons/x",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/share-2",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/copy",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/paperclip",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/download",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/crop",()=>({default:()=>null}));
vi.mock("./media-orientation",()=>({useRotatableScreen:f.rotate}));vi.mock("./media-save",()=>({useSaveToPhotos:()=>({save:f.save,busy:false,error:null})}));
vi.mock("./media-crop-overlay",()=>({MediaCropOverlay:({onApply}:{onApply(u:string):void})=>createElement("button",{onClick:()=>onApply("file:///crop.png")},"Apply crop")}));
vi.mock("./reader-context",()=>({ReaderContext:()=>null}));
vi.mock("./status-line",()=>({TextAction:({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label)}));vi.mock("./busy-glyph",()=>({BusyIndicator:()=>null}));vi.mock("./use-reduced-motion",()=>({useReducedMotionPreference:()=>true}));
import { MediaGallery, MediaViewer, mediaViewerStatus } from "./media-viewer";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement;
const render=(visible=true,uri="file:///image.png")=>act(async()=>root!.render(createElement(MediaViewer,{visible,uri,name:"Image",onClose:()=>{}})));
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.mounts=0;f.mounted=[];f.width=0;f.a11y=undefined;container=document.createElement("div");root=createRoot(container);});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;vi.unstubAllGlobals();});
it("retries the preview without clearing a separate sharing failure or accepting old image errors",async()=>{
 await render();const old=f.error;await act(async()=>old());expect(container.textContent).toContain("Preview could not be opened.");expect(container.textContent).not.toContain("Share failed");
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
it("reports one viewer status at a time: a failed preview first, then the latest action result",()=>{
 const preview=new Error("Preview"),share=new Error("Share"),save=new Error("Save");
 expect(mediaViewerStatus({preview,copy:null,share,save,copied:true})).toEqual({kind:"preview",error:preview});
 expect(mediaViewerStatus({preview:null,copy:null,share,save,copied:true})).toEqual({kind:"action",error:share});
 expect(mediaViewerStatus({preview:null,copy:null,share:null,save:null,copied:true})).toEqual({kind:"copied"});
 expect(mediaViewerStatus({preview:null,copy:null,share:null,save:null,copied:false})).toBeNull();
});
it("pages a message's images from the tapped one with a counter, also by accessibility actions",async()=>{
 const items=Array.from({length:7},(_,i)=>({key:`p${i}`,name:`photo-${i+1}.jpg`,uri:`file:///photo-${i+1}.jpg`}));
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items,index:2,onClose:()=>{}})));
 expect(container.textContent).toContain("3 / 7");expect(f.uri).toBe("file:///photo-3.jpg");
 await act(async()=>f.a11y!({nativeEvent:{actionName:"increment"}}));expect(container.textContent).toContain("4 / 7");expect(f.uri).toBe("file:///photo-4.jpg");
 for(let i=0;i<5;i++)await act(async()=>f.a11y!({nativeEvent:{actionName:"decrement"}}));
 expect(container.textContent).toContain("1 / 7");expect(f.uri).toBe("file:///photo-1.jpg");
});
it("shows a not-yet-loaded page with its download action instead of an image",async()=>{
 const load=vi.fn();
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items:[{key:"a",name:"a.jpg",uri:"file:///a.jpg"},{key:"b",name:"b.jpg",status:"download",detail:"6.0 MB",onLoad:load}],index:1,onClose:()=>{}})));
 expect(container.textContent).toContain("2 / 2");expect(container.textContent).toContain("6.0 MB");
 expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Share")).toBe(false);
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Download")!.click());expect(load).toHaveBeenCalledOnce();
});
it("shows no counter for a single image",async()=>{
 await render();expect(container.textContent).not.toContain("1 / 1");
});
it("makes the counter the adjustable control, so the pages stay reachable by a screen reader",async()=>{
 const items=[{key:"a",name:"a.jpg",uri:"file:///a.jpg"},{key:"b",name:"b.jpg",status:"download" as const,onLoad:()=>{}}];
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items,index:1,onClose:()=>{}})));
 const adjustable=[...container.querySelectorAll("[data-role=adjustable]")];
 expect(adjustable).toHaveLength(1);expect(adjustable[0]!.textContent).toBe("2 / 2");
 expect(adjustable[0]!.contains([...container.querySelectorAll("button")].find(b=>b.textContent==="Download")!)).toBe(false);
});
it("never remounts a page's image when the page turns",async()=>{
 f.width=400;
 const items=Array.from({length:4},(_,i)=>({key:`p${i}`,name:`p${i}.jpg`,uri:`file:///p${i}.jpg`}));
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items,index:0,onClose:()=>{}})));
 expect([...f.mounted].sort()).toEqual(["file:///p0.jpg","file:///p1.jpg"]);
 await act(async()=>f.a11y!({nativeEvent:{actionName:"increment"}}));
 expect(container.textContent).toContain("2 / 4");
 // Only the newly reached neighbour mounts; the page that became current keeps its image.
 expect([...f.mounted].sort()).toEqual(["file:///p0.jpg","file:///p1.jpg","file:///p2.jpg"]);
});
it("clamps the page and reports it when the gallery's items shrink",async()=>{
 const pages=vi.fn();
 const items=Array.from({length:5},(_,i)=>({key:`p${i}`,name:`p${i}.jpg`,uri:`file:///p${i}.jpg`}));
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items,index:4,onClose:()=>{},onIndexChange:pages})));
 expect(container.textContent).toContain("5 / 5");expect(pages).toHaveBeenLastCalledWith(4);
 await act(async()=>root!.render(createElement(MediaGallery,{visible:true,items:items.slice(0,3),index:4,onClose:()=>{},onIndexChange:pages})));
 expect(container.textContent).toContain("3 / 3");expect(f.uri).toBe("file:///p2.jpg");expect(pages).toHaveBeenLastCalledWith(2);
 await act(async()=>f.a11y!({nativeEvent:{actionName:"decrement"}}));
 expect(container.textContent).toContain("2 / 3");expect(pages).toHaveBeenLastCalledWith(1);
});
