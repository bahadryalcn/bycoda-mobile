// @vitest-environment happy-dom
import { act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ComposerActionArea, ComposerActionsProvider, ComposerActionSlot, createComposerActionsStore } from "./composer-actions";
it("keeps a stable ordered snapshot and does not execute registered controls",()=>{
 const store=createComposerActionsStore(),changed=vi.fn(),run=vi.fn(),node=createElement("button",{onClick:run},"Queue");store.subscribe(changed);store.set("queue",node);const snapshot=store.getSnapshot();store.set("queue",node);store.remove("absent");expect(store.getSnapshot()).toBe(snapshot);expect(changed).toHaveBeenCalledOnce();expect(run).not.toHaveBeenCalled();store.remove("queue");expect(store.getSnapshot()).toEqual([]);
});
it("moves presentation to its toolbar area without remounting the controller or losing its draft",()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement("div"),root=createRoot(host);document.body.append(host);let mounts=0,cleanups=0,edit:((text:string)=>void)|undefined;const called=vi.fn();
 function Controller({count}:{count:number}){const[value,setValue]=useState("Queue draft");edit=setValue;useEffect(()=>{mounts++;return()=>{cleanups++;};},[]);return createElement("section",null,createElement("input",{value,onChange:(e:any)=>setValue(e.target.value)}),createElement(ComposerActionSlot,null,createElement("button",{onClick:()=>called(value)},String(count))));}
 const render=(count:number,visible=true)=>act(()=>root.render(createElement(ComposerActionsProvider,null,visible?createElement(Controller,{count}):null,createElement("aside",null,createElement(ComposerActionArea)))));
 try {render(2);const input=host.querySelector("input"),button=host.querySelector<HTMLButtonElement>("aside button")!;button.focus();expect(host.querySelector("section button")).toBeNull();expect(host.querySelector("aside button")?.textContent).toBe("2");act(()=>edit!("Edited queue draft"));render(3);expect(host.querySelector("input")).toBe(input);expect(input!.value).toBe("Edited queue draft");expect(host.querySelector("aside button")).toBe(button);expect(document.activeElement).toBe(button);act(()=>host.querySelector<HTMLButtonElement>("aside button")!.click());expect(called).toHaveBeenCalledExactlyOnceWith("Edited queue draft");expect(mounts).toBe(1);expect(cleanups).toBe(0);render(3,false);expect(host.querySelector("aside button")).toBeNull();expect(cleanups).toBe(1);}
 finally {act(()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it("retains standalone inline presentation when no composer owns an action area",()=>{
 expect(renderToStaticMarkup(createElement(ComposerActionSlot,null,createElement("button",null,"Queue")))).toContain("Queue");
});
