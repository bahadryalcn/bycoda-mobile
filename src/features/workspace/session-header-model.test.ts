import { expect, it } from "vitest";
import { sessionStatusInline } from "./session-header-model";
it("keeps frequent controls first when their measured footprint leaves too little readable status",()=>{
 expect(sessionStatusInline(390,180,1)).toBe(true);
 expect(sessionStatusInline(288,210,1)).toBe(false);
 expect(sessionStatusInline(288,230,2)).toBe(false);
 expect(sessionStatusInline(635,230,2)).toBe(true);
});
it("starts safely and ignores invalid geometry/scale",()=>{
 for(const width of [0,-1,NaN,Infinity])expect(sessionStatusInline(width,200,1)).toBe(false);
 expect(sessionStatusInline(288,NaN,1)).toBe(false);
 expect(sessionStatusInline(390,200,Infinity)).toBe(true);
});
