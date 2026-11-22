import { lineHeight, metrics, space } from "./tokens";
import { workspaceFrameBudget } from "./workspace-frame-model";
export const COMPOSER_LINE_HEIGHT = lineHeight.input;
/** Vertical padding that makes one line fill the 48dp touch target. */
export const COMPOSER_FIELD_PADDING = Math.floor((metrics.composerFieldMin - COMPOSER_LINE_HEIGHT) / 2);
/** The field grows to this many lines, then scrolls. */
export const COMPOSER_MAX_LINES = 5;
const positive = (value: number) => Number.isFinite(value) && value > 0;
const measured = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;

function composerMinimumHeight(scale: number) {
  return Math.max(metrics.composerFieldMin, Math.ceil(COMPOSER_LINE_HEIGHT * scale + COMPOSER_FIELD_PADDING * 2));
}

/** The editor and its primary actions must fit after the measured non-editing rows. */
export function composerNeedsInlineActions(available: number | null, fontScale: number, toolbar: number, operations: number): boolean {
  if (available === null || !Number.isFinite(available)) return false;
  const scale = positive(fontScale) ? Math.max(1, fontScale) : 1;
  const chrome = Math.max(metrics.touchTarget, measured(toolbar)) + measured(operations) + space.sm * 2;
  return available < Math.max(3 * metrics.touchTarget, composerMinimumHeight(scale) + chrome);
}

/** Leave room for Stop and Send together, the other actions, and the model label. */
export function needsModelRow(width: number, fontScale: number): boolean {
  const scale = positive(fontScale) ? Math.max(1, fontScale) : 1;
  const actionWidth = metrics.touchTarget * 7 + space.xs * 7;
  return positive(width) && width < actionWidth + space.sm * 2 + 100 * scale;
}
/** Input growth spends only the room left by measured controls and readable conversation. */
export function composerInputLimits(windowHeight:number,available:number|null,fontScale:number,prefix:number,footer:number,toolbar:number) {
  const scale=positive(fontScale)?Math.max(1,fontScale):1;
  const minimum=composerMinimumHeight(scale);
  const frame=available!==null&&Number.isFinite(available)&&available>=0?available:positive(windowHeight)?windowHeight:null;
  const budget=workspaceFrameBudget(scale);
  const before=measured(prefix),after=measured(footer);
  const chrome=before+after+Math.max(budget.header,measured(toolbar))+space.sm*2+(before?space.xs:0)+(after?space.xs:0);
  const cap=Math.ceil(COMPOSER_LINE_HEIGHT*scale*COMPOSER_MAX_LINES+COMPOSER_FIELD_PADDING*2);
  const preferred=Math.min(cap,positive(windowHeight)?Math.floor(windowHeight/4):cap,frame===null?cap:Math.floor(frame*0.45));
  const remaining=frame===null?preferred:Math.floor(frame-chrome-budget.header-budget.body);
  return {minimum,maximum:Math.max(minimum,Math.min(preferred,remaining)),chrome,reserved:budget.header+budget.body};
}

/** Bound extras above the input, leaving room for at least one editable line and the measured actions. */
export function composerPrefixMaximum(
  windowHeight: number,
  available: number | null,
  fontScale: number,
  operations: number,
  footer: number,
  toolbar: number,
): number {
  const frame = measured(available ?? windowHeight);
  const input = composerInputLimits(windowHeight, frame, fontScale, operations, footer, toolbar);
  const room = Math.floor(frame - input.chrome - input.minimum - space.xs);
  const threeRows = metrics.touchTarget * 3 + space.sm * 2;
  return Math.max(0, Math.min(room, Math.floor(frame / 3), threeRows));
}

/** Suggestions spend remaining scene space after the editor and measured chrome.
 * Preserve a reachable workspace header when one readable option still fits. */
export function composerSuggestionLimits(windowHeight:number,available:number|null,fontScale:number,prefix:number,footer:number,toolbar:number) {
  const input=composerInputLimits(windowHeight,available,fontScale,prefix,footer,toolbar);
  const scale=positive(fontScale)?Math.max(1,fontScale):1;
  const frame=available!==null&&Number.isFinite(available)&&available>=0?available:positive(windowHeight)?windowHeight:0;
  const row=Math.max(metrics.touchTarget,Math.ceil((COMPOSER_LINE_HEIGHT+18)*scale+space.sm*2));
  const compactMinimum=row+space.xs*2;
  const header=workspaceFrameBudget(scale).header;
  const room=Math.max(0,Math.floor(frame-input.chrome-input.minimum-space.xs));
  const maximum=Math.min(280,room-header>=compactMinimum?room-header:room);
  return {maximum,compact:maximum<header+space.sm*2+space.xs+row};
}
