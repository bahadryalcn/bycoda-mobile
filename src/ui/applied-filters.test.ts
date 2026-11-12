import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {caption:{}} })}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("./typography",()=>({Body:({children}:PropsWithChildren)=>createElement("p",null,children)}));
vi.mock("./styles",()=>({uiStyles:{caption:{}}}));
vi.mock("./tokens",()=>({colors:{},radii:{},space:{}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("./buttons",()=>({Button:()=>null,IconButton:()=>null}));
vi.mock("./layout",()=>({Row:()=>null}));
vi.mock("./dialogs",()=>({Sheet:()=>null}));
vi.mock("lucide-react-native/icons/sliders-horizontal",()=>({default:()=>null}));
import { AppliedFilters } from "./filter-sheet";
it("adds no empty summary region and retains a zero-result count",()=>{
 expect(renderToStaticMarkup(createElement(AppliedFilters,{filters:[false,null,undefined,""]}))).toBe("");
 expect(renderToStaticMarkup(createElement(AppliedFilters,{filters:[],result:"0 items"}))).toBe("<p>0 items</p>");
});
it("keeps full applied filter identities, order and result context without changing the input",()=>{
 const filters=Object.freeze(["Source: "+"long-project-name/".repeat(10),false,"Level: Error"] as const);
 const html=renderToStaticMarkup(createElement(AppliedFilters,{filters,result:"3 items"}));
 expect(html).toBe(`<p>3 items · ${filters[0]} · Level: Error</p>`);
 expect(filters).toHaveLength(3);
});
