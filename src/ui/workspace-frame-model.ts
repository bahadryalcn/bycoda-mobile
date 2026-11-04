import {fontSize,metrics,space} from "./tokens";

/** Header content may scroll; reserve one readable input/action pair for the workspace. */
export function workspaceFrameBudget(fontScale:number) {
  const scale=Number.isFinite(fontScale)?Math.max(1,fontScale):1;
  const input=Math.max(metrics.inputHeight,fontSize.input*scale+space.md*2);
  const action=Math.max(metrics.touchTarget,fontSize.control*scale+space.sm*2);
  return {header:action,body:input+action+space.lg};
}
export function workspaceHeaderMaximum(height:number,fontScale:number) {
  const {header,body}=workspaceFrameBudget(fontScale);
  if(!Number.isFinite(height)||height<=0)return header;
  return Math.min(height,Math.max(header,height-body));
}
