import { expect,it } from "vitest";
import { toolPreviewPage,toolPreviewSource } from "./tool-preview-source";
it("preserves all numbered diff lines beyond 300 and the complete original output",()=>{
 const source=toolPreviewSource({kind:"write",lines:Array.from({length:350},(_,i)=>({kind:i%2?"add":"del",number:i,text:"line "+i})),output:"\n\t output  \n"});
 expect(source.text).toContain("0 − line 0");expect(source.text).toContain("349 + line 349");expect(source.text.endsWith("\n\t output  \n")).toBe(true);
 expect(source.runs.at(-1)?.kind).toBe("output");
});
it("reconstructs Unicode and long partial lines exactly across every character page",()=>{
 const source=toolPreviewSource({kind:"read",lines:[{kind:"context",text:"x".repeat(11995)+"🙂"+"y".repeat(14000)},{kind:"add",number:10,text:"z"}],output:"original output\n"});
 const pages=Array.from({length:Math.ceil(source.text.length/12000)},(_,i)=>toolPreviewPage(source,i*12000,(i+1)*12000));
 expect(pages.map(page=>page.map(run=>run.text).join("")).join("")).toBe(source.text);
 expect(pages.every(page=>page.reduce((n,run)=>n+run.text.length,0)<=12001)).toBe(true);
 expect(pages.flat().find(run=>run.kind==="add")?.text).toContain("10 + z");
});
it("does not interpret output prefixes as diff colors or strip its source",()=>{
 const source=toolPreviewSource({kind:"shell",output:"+ plain output\n− still output\n"});expect(toolPreviewPage(source,0,12000)).toEqual([{kind:"output",text:source.text}]);
 expect(toolPreviewSource({kind:"read"})).toEqual({text:"",runs:[]});
});
