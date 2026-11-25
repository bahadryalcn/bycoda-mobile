import { terminalDisplayOutput } from "./terminal-model";

type ColorRun = { text: string; foreground?: string; background?: string };

// ANSI palette for the terminal's dark transcript. Extended colors use the xterm color cube.
const rgb = (channels: number[]) => `rgb(${channels.join(",")})`;
const colors = [
  [43, 43, 43], [239, 119, 119], [155, 215, 119], [232, 199, 117],
  [131, 171, 237], [216, 158, 233], [138, 215, 223], [222, 222, 222],
  [136, 136, 136], [255, 152, 152], [185, 235, 152], [249, 224, 158],
  [163, 193, 255], [240, 183, 250], [169, 238, 242], [255, 255, 255],
].map(rgb);
const isByte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 255;

function indexedColor(index: number): string | undefined {
  if (!isByte(index)) return undefined;
  if (index < 16) return colors[index];
  if (index >= 232) return rgb(Array(3).fill(8 + (index - 232) * 10));
  const cube = index - 16;
  return rgb([Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6].map(level => level ? 55 + 40 * level : 0));
}

/** Preserve SGR colors while treating the captured line-shell transcript as inert text. */
export function terminalColorRuns(output: string): ColorRun[] {
  const runs: ColorRun[] = [];
  let foreground: string | undefined, background: string | undefined, start = 0;
  const add = (end: number) => {
    const text = terminalDisplayOutput(output.slice(start, end));
    if (text) runs.push({ text, foreground, background });
  };
  // Consume OSC and other CSI sequences as a unit so embedded bytes cannot change colors.
  for (const match of output.matchAll(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[([0-?]*)[ -/]*([@-~])/g)) {
    if (match[2] !== "m" || !/^[\d;]*$/.test(match[1])) continue;
    add(match.index);
    start = match.index + match[0].length;
    const parameters = match[1].split(";").map(Number);
    for (let index = 0; index < parameters.length; index++) {
      const code = parameters[index];
      if (code === 0) foreground = background = undefined;
      if (code === 39) foreground = undefined;
      if (code === 49) background = undefined;
      if (code >= 30 && code <= 37) foreground = colors[code - 30];
      if (code >= 40 && code <= 47) background = colors[code - 40];
      if (code >= 90 && code <= 97) foreground = colors[code - 82];
      if (code >= 100 && code <= 107) background = colors[code - 92];
      if (code === 38 || code === 48) {
        const mode = parameters[++index];
        const channels = parameters.slice(index + 1, index + 4);
        const color = mode === 5 ? indexedColor(parameters[++index]) : mode === 2 && channels.length === 3 && channels.every(isByte) ? rgb(channels) : undefined;
        if (mode === 2) index += 3;
        if (color !== undefined) {
          if (code === 38) foreground = color;
          else background = color;
        }
      }
    }
  }
  add(output.length);
  return runs;
}
