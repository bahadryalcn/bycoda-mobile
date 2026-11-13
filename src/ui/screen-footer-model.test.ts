import { expect, it } from "vitest";
import { screenFooterLimits } from "./screen-footer-model";
it("keeps a readable body inside short allocated scenes instead of spending the window",()=>{
 expect(screenFooterLimits(200,1)).toEqual({bodyMinimum:80,maximum:120});
 expect(screenFooterLimits(200,2)).toEqual({bodyMinimum:88,maximum:112});
 for(const height of [160,200,280,400,844])for(const scale of [1,2,3,4]) {
  const result=screenFooterLimits(height,scale);
  expect(result.maximum+result.bodyMinimum).toBe(height);
  expect(result.bodyMinimum).toBeGreaterThanOrEqual(Math.min(height/2,72));
 }
});
it("subtracts a fixed header exactly once and never produces negative or invalid bounds",()=>{
 expect(screenFooterLimits(280,1,80)).toEqual(screenFooterLimits(200,1));
 expect(screenFooterLimits(200,1,300)).toEqual({bodyMinimum:0,maximum:0});
 for(const height of [0,-1,NaN,Infinity])for(const scale of [NaN,Infinity,-1]) {
  const result=screenFooterLimits(height,scale,NaN);
  expect(result).toEqual({bodyMinimum:0,maximum:0});
 }
});
