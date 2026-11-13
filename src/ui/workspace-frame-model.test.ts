import {expect,it} from "vitest";
import {workspaceHeaderMaximum} from "./workspace-frame-model";
it("keeps normal two-row navigation possible beside a useful body",()=>{
 expect(workspaceHeaderMaximum(230,1)).toBe(118);
 expect(workspaceHeaderMaximum(560,1)).toBe(448);
});
it("reserves a readable input/action pair even when expanded feedback is very long",()=>{
 for(const height of [144,230,375,640])for(const [scale,budget] of [[1,104],[2,120],[3,142]]){
  const maximum=workspaceHeaderMaximum(height,scale);expect(maximum).toBeGreaterThanOrEqual(0);expect(height-maximum).toBeGreaterThanOrEqual(Math.min(height/2,budget));
 }
});
it("starts bounded and handles invalid native geometry",()=>{
 for(const height of [0,-1,NaN,Infinity])expect(workspaceHeaderMaximum(height,1)).toBe(48);
 expect(Number.isFinite(workspaceHeaderMaximum(230,Infinity))).toBe(true);
});

it("keeps one full control available in a short positive viewport",()=>{
 for(const height of [48,60,80,96]) { const maximum=workspaceHeaderMaximum(height,2);expect(maximum).toBeGreaterThanOrEqual(48);expect(maximum).toBeLessThanOrEqual(height); }
 expect(workspaceHeaderMaximum(24,2)).toBe(24);
});

it("gives short conversations room for search and a readable message after a full header control",()=>{
 expect(workspaceHeaderMaximum(162,2)).toBe(48);
 expect(162-workspaceHeaderMaximum(162,2)).toBe(114);
});

it("lets large native controls grow beyond the minimum touch size",()=>{
 expect(workspaceHeaderMaximum(162,3)).toBe(54);
 expect(workspaceHeaderMaximum(162,4)).toBe(68);
 expect(workspaceHeaderMaximum(0,3)).toBe(54);
});
