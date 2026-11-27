import { terminalDisplayOutput } from "./terminal-model";

/** 0-15 is a base ANSI colour resolved by the reader's theme; a string is a literal `rgb()` colour. */
export type TerminalAnsiColor = number | string;
export type TerminalAnsiStyle = {
  foreground?: TerminalAnsiColor; background?: TerminalAnsiColor;
  bold?: true; dim?: true; italic?: true; underline?: true; inverse?: true; strike?: true;
};
export type TerminalAnsiRun = TerminalAnsiStyle & { text: string };

const rgb = (channels: readonly number[]) => `rgb(${channels.join(",")})`;
const isByte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 255;
/** Anything terminalDisplayOutput would rewrite: ESC, CR and the other control characters. */
const DISPLAY_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
/** OSC strings and every CSI sequence; only SGR (`m`) changes the style. */
const SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[([0-?]*)[ -/]*([@-~])/g;

/** xterm 256-colour index: 0-15 stay theme colours, then the 6x6x6 cube and the grey ramp. */
function indexedColor(index: number): TerminalAnsiColor | undefined {
  if (!isByte(index)) return undefined;
  if (index < 16) return index;
  if (index >= 232) return rgb(Array(3).fill(8 + (index - 232) * 10));
  const cube = index - 16;
  return rgb([Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6].map(level => level ? 55 + 40 * level : 0));
}

function applySgr(style: TerminalAnsiStyle, parameters: number[]): TerminalAnsiStyle {
  let next = { ...style };
  for (let index = 0; index < parameters.length; index++) {
    const code = parameters[index];
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strike = true;
    else if (code === 22) { delete next.bold; delete next.dim; }
    else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code === 27) delete next.inverse;
    else if (code === 29) delete next.strike;
    else if (code >= 30 && code <= 37) next.foreground = code - 30;
    else if (code === 39) delete next.foreground;
    else if (code >= 40 && code <= 47) next.background = code - 40;
    else if (code === 49) delete next.background;
    else if (code >= 90 && code <= 97) next.foreground = code - 82;
    else if (code >= 100 && code <= 107) next.background = code - 92;
    else if (code === 38 || code === 48) {
      const mode = parameters[++index];
      let color: TerminalAnsiColor | undefined;
      if (mode === 5) color = indexedColor(parameters[++index]);
      else if (mode === 2) {
        const channels = parameters.slice(index + 1, index + 4);
        index += 3;
        if (channels.length === 3 && channels.every(isByte)) color = rgb(channels);
      }
      if (color !== undefined) {
        if (code === 38) next.foreground = color;
        else next.background = color;
      }
    }
  }
  return next;
}

/**
 * Splits captured shell output into styled runs (SGR colours, bold, dim, italic, underline, inverse,
 * strikethrough). Other control sequences are consumed as a unit and dropped, so the transcript stays
 * inert text. Pure and theme-independent: callers memoize per output string.
 */
export function terminalAnsiRuns(output: string): TerminalAnsiRun[] {
  const runs: TerminalAnsiRun[] = [];
  let style: TerminalAnsiStyle = {};
  let start = 0;
  const add = (end: number) => {
    const slice = output.slice(start, end);
    // Most runs are plain text; skip the stripping passes when there is nothing to strip.
    const text = DISPLAY_CONTROL.test(slice) ? terminalDisplayOutput(slice) : slice;
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, style)) last.text += text;
    else runs.push({ ...style, text });
  };
  for (const match of output.matchAll(SEQUENCE)) {
    if (match[2] !== "m" || !/^[\d;]*$/.test(match[1])) continue;
    add(match.index);
    start = match.index + match[0].length;
    style = applySgr(style, match[1] === "" ? [0] : match[1].split(";").map(value => value === "" ? 0 : Number(value)));
  }
  add(output.length);
  return runs;
}

const STYLE_KEYS = ["foreground", "background", "bold", "dim", "italic", "underline", "inverse", "strike"] as const;
function sameStyle(a: TerminalAnsiStyle, b: TerminalAnsiStyle): boolean {
  return STYLE_KEYS.every(key => a[key] === b[key]);
}

/** True when a run renders exactly like the surrounding default text. */
export function plainAnsiRun(run: TerminalAnsiRun): boolean {
  return STYLE_KEYS.every(key => run[key] === undefined);
}

function channels(color: string): [number, number, number] | undefined {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const match = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color.replace(/\s/g, ""));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Native text style of one run; base colours come from the reader's palette and default ink/surface. */
export function terminalAnsiTextStyle(run: TerminalAnsiStyle, palette: readonly string[], ink: string, surface: string) {
  const resolve = (color: TerminalAnsiColor | undefined) =>
    color === undefined ? undefined : typeof color === "number" ? palette[color] : color;
  let foreground = resolve(run.foreground);
  let background = resolve(run.background);
  if (run.inverse) [foreground, background] = [background ?? surface, foreground ?? ink];
  if (run.dim) {
    const parts = channels(foreground ?? ink);
    if (parts) foreground = `rgba(${parts.join(",")},0.6)`;
  }
  const decoration = run.underline && run.strike ? "underline line-through" : run.underline ? "underline" : run.strike ? "line-through" : undefined;
  return {
    ...(foreground ? { color: foreground } : null),
    ...(background ? { backgroundColor: background } : null),
    ...(run.bold ? { fontWeight: "700" as const } : null),
    ...(run.italic ? { fontStyle: "italic" as const } : null),
    ...(decoration ? { textDecorationLine: decoration as "underline" | "line-through" | "underline line-through" } : null),
  };
}
