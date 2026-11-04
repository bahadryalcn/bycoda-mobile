// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createOverlayWebFocus, type WebMenuLayer } from "./overlay-web-focus";

const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); });
function fixture() {
  document.body.innerHTML = '<main><button id="root">Root</button></main><section><button id="sheet">Sheet actions</button></section><div><button role="menuitem">First</button><button role="menuitem" aria-disabled="true">Disabled</button><button role="menuitem">Last</button></div>';
  const [background, sheet, menu] = [...document.body.children] as HTMLElement[];
  for (const node of document.querySelectorAll<HTMLElement>("*")) node.getClientRects = () => [{ width: 50, height: 50 }] as unknown as DOMRectList;
  const controller = createOverlayWebFocus(document); disposals.push(() => controller.dispose());
  const root = document.getElementById("root")!, anchor = document.getElementById("sheet")!, close = vi.fn();
  const state = { background: background!, unlocked: true, layers: [] as {id:string;element:HTMLElement;visible:boolean;onClose():void}[] };
  controller.sync(state);
  const entry: WebMenuLayer = { id:"menu", element:menu!, anchor:root, label:"Project actions", check:()=>true, onClose:close };
  return { controller, background:background!, sheet:sheet!, menu:menu!, root, anchor, close, state, entry };
}
function key(value:string, init:KeyboardEventInit={}) { const event = new KeyboardEvent("keydown",{key:value,bubbles:true,cancelable:true,...init});document.activeElement!.dispatchEvent(event);return event; }

it("makes the menu the only keyboard owner and restores its trigger without running an action", () => {
 const f=fixture();f.root.focus();const unregister=f.controller.registerMenu(f.entry);
 expect(f.menu.getAttribute("role")).toBe("menu");expect(f.menu.getAttribute("aria-label")).toBe("Project actions");expect(f.menu.hasAttribute("aria-modal")).toBe(false);
 expect(document.activeElement?.textContent).toBe("First");expect(f.background.hasAttribute("inert")).toBe(true);
 expect(key("Escape").defaultPrevented).toBe(true);expect(f.close).toHaveBeenCalledOnce();
 unregister();expect(document.activeElement).toBe(f.root);expect(f.background.hasAttribute("inert")).toBe(false);
});
it("keeps Sheet dismissal behind menu Escape and restores the Sheet trigger before asking its guard", () => {
 const f=fixture(),guard=vi.fn();f.root.focus();f.state.layers=[{id:"sheet",element:f.sheet,visible:true,onClose:guard}];f.controller.sync(f.state);f.anchor.focus();
 const unregister=f.controller.registerMenu({...f.entry,anchor:f.anchor});key("Escape");expect(f.close).toHaveBeenCalledOnce();expect(guard).not.toHaveBeenCalled();
 unregister();expect(document.activeElement).toBe(f.anchor);expect(f.sheet.hasAttribute("inert")).toBe(false);key("Escape");expect(guard).toHaveBeenCalledOnce();
});
it("cycles enabled menu items with arrows, Home/End and Tab without moving to disabled or background controls", () => {
 const f=fixture();f.controller.registerMenu(f.entry);
 for(const [value,expected] of [["ArrowDown","Last"],["ArrowDown","First"],["ArrowUp","Last"],["Home","First"],["End","Last"],["Tab","First"]]) {key(value!);expect(document.activeElement?.textContent).toBe(expected);}
 key("Tab",{shiftKey:true});expect(document.activeElement?.textContent).toBe("Last");
 const ime=key("Escape",{isComposing:true});expect(ime.defaultPrevented).toBe(false);expect(f.close).not.toHaveBeenCalled();
 const event=new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true});event.preventDefault();document.activeElement!.dispatchEvent(event);expect(f.close).not.toHaveBeenCalled();
});
it("retires a menu if another Sheet takes ownership, without redirecting focus back into the old source", () => {
 const f=fixture();f.root.focus();f.controller.registerMenu(f.entry);const closeSheet=vi.fn();f.state.layers=[{id:"new-sheet",element:f.sheet,visible:true,onClose:closeSheet}];f.controller.sync(f.state);
 expect(f.close).toHaveBeenCalledOnce();expect(f.menu.getAttribute("aria-hidden")).toBe("true");expect(document.activeElement).toBe(f.sheet);key("Escape");expect(closeSheet).toHaveBeenCalledOnce();
});
it("conceals revoked private menus and does not restore focus on lock", () => {
 const f=fixture();let allowed=true;f.root.focus();f.controller.registerMenu({...f.entry,check:()=>allowed});allowed=false;f.controller.sync({...f.state,unlocked:false});
 expect(f.close).toHaveBeenCalledOnce();expect(f.menu.getAttribute("aria-hidden")).toBe("true");expect(document.activeElement).not.toBe(f.root);key("Escape");expect(f.close).toHaveBeenCalledOnce();
});
it("does not let a retired registration remove its replacement and releases listeners on disposal", () => {
 const f=fixture();const stale=f.controller.registerMenu(f.entry),close=vi.fn();f.controller.registerMenu({...f.entry,onClose:close});stale();key("Escape");expect(close).toHaveBeenCalledOnce();
 f.controller.dispose();key("Escape");expect(close).toHaveBeenCalledOnce();
});

it("retires access revoked without a render before handling the next key and does not restore forbidden focus", () => {
 const f=fixture();let allowed=true;f.root.focus();f.controller.registerMenu({...f.entry,check:()=>allowed});allowed=false;
 key("ArrowDown");expect(f.close).toHaveBeenCalledOnce();expect(f.menu.getAttribute("aria-hidden")).toBe("true");expect(document.activeElement).not.toBe(f.root);
});
