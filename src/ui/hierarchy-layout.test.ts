import {expect,it} from "vitest";
import {hierarchyLayout} from "./hierarchy-layout";
it("retains normal indentation when the identity still has room",()=>{
 expect(hierarchyLayout({width:600,depth:4,step:12,reservedWidth:73,typeSize:17})).toEqual({indent:48,compressed:false});
});
it("spends less indentation as the measured cell narrows or native text grows",()=>{
 const base={depth:4,step:12,reservedWidth:73,typeSize:17};
 expect(hierarchyLayout({...base,width:216})).toEqual({indent:7,compressed:true});
 expect(hierarchyLayout({...base,width:216,typeSize:34})).toEqual({indent:0,compressed:true});
});
it("keeps a readable identity budget for every supported width/depth/scale",()=>{
 for(const width of [216,288,635])for(const depth of [0,1,3,4,1000])for(const scale of [1,1.5,2,3]){
  const r=hierarchyLayout({width,depth,step:12,reservedWidth:73,typeSize:17*scale});
  expect(r.indent).toBeGreaterThanOrEqual(0);expect(r.indent).toBeLessThanOrEqual(depth*12);
  expect(width-73-r.indent).toBeGreaterThanOrEqual(Math.min(width-73,17*scale*8));
 }
});
it("uses no indentation before measurement or for invalid geometry",()=>{
 for(const width of [0,-1,NaN,Infinity])expect(hierarchyLayout({width,depth:3,step:12,reservedWidth:73,typeSize:34})).toEqual({indent:0,compressed:true});
 expect(hierarchyLayout({width:300,depth:NaN,step:12,reservedWidth:73,typeSize:17})).toEqual({indent:0,compressed:false});
});
