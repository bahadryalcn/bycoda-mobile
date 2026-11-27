import { expect, it } from "vitest";
import { COMPOSER_FIELD_PADDING, COMPOSER_LINE_HEIGHT, COMPOSER_MAX_LINES, MODEL_CHIP_LABEL_MIN, composerToolbarLayout, composerInputLimits, composerNeedsInlineActions, composerOperationsLayout, composerPrefixMaximum, composerSuggestionLimits } from "./chat-composer-model";

const ADD = 48, MIC_SEND = 48 * 2 + 4, MIC_STOP_SEND = 48 * 3 + 8;
it.each([288, 328, 370, 398])("keeps the %i pt toolbar on one line and gives the model the rest", (toolbar) => {
  for (const fontScale of [1, 2]) for (const trailing of [MIC_SEND, MIC_STOP_SEND]) {
    const layout = composerToolbarLayout({ toolbar, leading: ADD, trailing, fontScale });
    // Padding, Add, the trailing controls, two gaps and the model add up to the measured row.
    expect(layout.model + 6 * 2 + ADD + trailing + 4 * 2).toBe(toolbar);
    expect(layout.model).toBeGreaterThanOrEqual(48);
    expect(layout.iconOnly).toBe(layout.model < MODEL_CHIP_LABEL_MIN * fontScale);
  }
});
it("shows the model label on phones at default text and only the provider mark when the chip is short", () => {
  const at = (toolbar: number, trailing: number, fontScale: number) =>
    composerToolbarLayout({ toolbar, leading: ADD, trailing, fontScale }).iconOnly;
  for (const width of [288, 328, 370, 398]) expect(at(width, MIC_SEND, 1)).toBe(false);
  expect(at(288, MIC_STOP_SEND, 1)).toBe(true);
  expect(at(328, MIC_STOP_SEND, 1)).toBe(false);
  expect(at(288, MIC_SEND, 2)).toBe(true);
  expect(at(328, MIC_SEND, 2)).toBe(true);
  expect(at(370, MIC_SEND, 2)).toBe(false);
  expect(at(398, MIC_SEND, 2)).toBe(false);
  expect(at(398, MIC_STOP_SEND, 2)).toBe(true);
});
it("adds the status control only when the model keeps a touch target", () => {
  const wide = composerToolbarLayout({ toolbar: 398, leading: ADD, trailing: MIC_STOP_SEND, status: true, fontScale: 1 });
  expect(wide.showStatus).toBe(true);
  expect(wide.model).toBe(398 - 12 - ADD - MIC_STOP_SEND - 8 - 52);
  const narrow = composerToolbarLayout({ toolbar: 288, leading: ADD, trailing: MIC_STOP_SEND, status: true, fontScale: 1 });
  expect(narrow.showStatus).toBe(false);
  expect(narrow.model).toBeGreaterThanOrEqual(48);
});
it("handles unmeasured and invalid widths without negative space", () => {
  for (const value of [0, NaN, -1, Infinity]) {
    const layout = composerToolbarLayout({ toolbar: value, leading: value, trailing: value, status: true, fontScale: value });
    expect(layout.model).toBeGreaterThanOrEqual(0);
  }
});

it("places primary actions beside the editor when the measured controls cannot fit above Gboard", () => {
  expect(composerNeedsInlineActions(152, 1, 100, 48)).toBe(true);
  expect(composerNeedsInlineActions(152, 1.5, 100, 0)).toBe(true);
  expect(composerNeedsInlineActions(200, 1, 48, 48)).toBe(false);
  expect(composerNeedsInlineActions(null, 1.5, 100, 48)).toBe(false);
});

it("shrinks the draft details after the keyboard opens while keeping the editor and toolbar reachable", () => {
  const expanded = composerPrefixMaximum(760, 720, 1.5, 0, 0, 100);
  const keyboard = composerPrefixMaximum(760, 290, 1.5, 0, 0, 152);
  const input = composerInputLimits(760, 290, 1.5, keyboard, 0, 152);
  expect(expanded).toBeGreaterThan(keyboard);
  expect(keyboard).toBeGreaterThanOrEqual(48);
  expect(input.chrome + input.minimum).toBeLessThanOrEqual(290);
  const veryShort = composerPrefixMaximum(760, 240, 1.5, 0, 0, 152);
  expect(veryShort).toBeLessThan(48);
  const shortInput = composerInputLimits(760, 240, 1.5, veryShort, 0, 152);
  expect(shortInput.chrome + shortInput.minimum).toBeLessThanOrEqual(240);
});
it("reserves a header and readable conversation after measured toolbar chrome",()=>{
 const short=composerInputLimits(844,280,1,0,0,48);expect(short.minimum).toBe(48);expect(short.maximum).toBe(60);expect(short.chrome).toBe(60);expect(280-short.chrome-short.maximum).toBe(short.reserved);
 expect(composerInputLimits(844,640,1,0,0,48).maximum).toBe(131);
});
it("responds to actual auxiliary/footer and wrapped toolbar heights without clipping the input floor",()=>{
 const basic=composerInputLimits(844,400,1,0,0,48);const busy=composerInputLimits(844,400,1,100,60,96);expect(busy.maximum).toBeLessThan(basic.maximum);expect(busy.maximum).toBe(busy.minimum);
 const large=composerInputLimits(844,280,2,0,0,48);expect(large.minimum).toBe(68);expect(large.maximum).toBe(68);
});
it("handles missing, zero and invalid geometry without an invalid text input size",()=>{
 for(const frame of [null,0,NaN,Infinity])for(const scale of [0,NaN,Infinity,3]){const result=composerInputLimits(NaN,frame,scale,-1,NaN,Infinity);expect(Number.isFinite(result.maximum)).toBe(true);expect(result.maximum).toBeGreaterThanOrEqual(result.minimum);expect(result.minimum).toBeGreaterThanOrEqual(48);}
});

it("keeps suggestions inside the measured scene with an editor and reachable toolbar",()=>{
 for(const scale of [1,2,3])for(const height of [200,280,400,640]) {
  const panel=composerSuggestionLimits(844,height,scale,0,0,48);
  const input=composerInputLimits(844,height,scale,panel.maximum,0,48);
  expect(panel.maximum).toBeGreaterThanOrEqual(0);
  expect(panel.maximum).toBeLessThanOrEqual(280);
  expect(input.chrome+input.minimum).toBeLessThanOrEqual(height);
 }
 expect(composerSuggestionLimits(844,260,1,0,0,48)).toEqual({maximum:100,compact:true});
 expect(composerSuggestionLimits(844,640,1,0,0,48)).toEqual({maximum:280,compact:false});
});
it("budgets existing notes, recovery and wrapping actions before suggestions",()=>{
 const plain=composerSuggestionLimits(844,400,1,0,0,48);
 const busy=composerSuggestionLimits(844,400,1,80,30,96);
 expect(busy.maximum).toBeLessThan(plain.maximum);
 expect(busy.compact).toBe(true);
 expect(composerSuggestionLimits(844,0,1,0,0,48).maximum).toBe(0);
 for(const frame of [null,NaN,Infinity])expect(Number.isFinite(composerSuggestionLimits(NaN,frame,NaN,-1,NaN,Infinity).maximum)).toBe(true);
});
it("caps the field at five lines and starts at the 48dp floor",()=>{
 const roomy=composerInputLimits(900,900,1,0,0,48);expect(roomy.minimum).toBe(48);expect(roomy.maximum).toBe(Math.ceil(COMPOSER_LINE_HEIGHT*COMPOSER_MAX_LINES+COMPOSER_FIELD_PADDING*2));
});

it("keeps a pinned child status bar on short frames and counts the form it shows", () => {
  // Without a pinned bar the layout is the plain operations decision.
  expect(composerOperationsLayout({ available: 200, fontScale: 1, toolbar: 48, operations: 48 })).toEqual({ short: false, height: 48 });
  expect(composerOperationsLayout({ available: 152, fontScale: 1, toolbar: 100, operations: 48 })).toEqual({ short: true, height: 0 });
  // A tall frame shows the full bar beside the operations row, with its gap.
  const tall = composerOperationsLayout({ available: 720, fontScale: 1, toolbar: 48, operations: 48, pinned: { full: 64, compact: 48 } });
  expect(tall).toEqual({ short: false, height: 48 + 64 + 4 });
  // The full bar's height alone can make the frame short; then only its compact line is counted.
  const fitsWithout = composerOperationsLayout({ available: 220, fontScale: 1, toolbar: 48, operations: 48 });
  expect(fitsWithout.short).toBe(false);
  const short = composerOperationsLayout({ available: 220, fontScale: 1, toolbar: 48, operations: 48, pinned: { full: 64, compact: 48 } });
  expect(short).toEqual({ short: true, height: 48 + 4 });
  // The compact measurement never feeds the decision, so the frame does not flip back.
  expect(composerOperationsLayout({ available: 220, fontScale: 1, toolbar: 48, operations: 48, pinned: { full: 64, compact: 0 } }).short).toBe(true);
});
