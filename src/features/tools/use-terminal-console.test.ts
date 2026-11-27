// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => { let next = 0; return { randomUUID: () => `00000000-0000-0000-0000-${String(++next).padStart(12, "0")}` }; });
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: { background: "bg", text: "fg", accent: "accent", selected: "sel" } }) }));
vi.mock("@/ui/tokens", () => ({ terminalAnsiPalettes: { dark: Array.from({ length: 16 }, (_, index) => `c${index}`), light: [] } }));
import { useTerminalConsole } from "./use-terminal-console";

type Props = Parameters<typeof useTerminalConsole>[0];
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
let hook: ReturnType<typeof useTerminalConsole>;
const posted: Record<string, any>[] = [];
const inputs: string[] = [];
const sizes: [number, number][] = [];
const props = (overrides: Partial<Props> = {}): Props => ({
  output: { output: "", cursor: 0 }, enabled: true,
  onInput: (data) => inputs.push(data), onResize: (cols, rows) => sizes.push([cols, rows]),
  ...overrides,
});
function Probe(value: Props) {
  hook = useTerminalConsole(value);
  hook.viewport.current = { post: (packet) => posted.push(packet), focusInput: vi.fn(), hideInput: vi.fn() };
  return null;
}
const render = (value: Props) => act(async () => root.render(createElement(Probe, value)));
const decode = (packet: Record<string, any>) => Buffer.from(packet.dataBase64, "base64").toString("utf8");
/** Everything the terminal was sent, acknowledging each packet as the document does. */
const screenText = async () => {
  let text = "";
  for (;;) {
    const packet = posted.find((entry) => entry.type === "output" && !entry.seen);
    if (!packet) return text;
    packet.seen = true;
    text += decode(packet);
    await act(async () => hook.onPacket({ type: "ack", nonce: hook.nonce, next: packet.next }));
  }
};
const ready = (cols = 40, rows = 10) => act(async () => hook.onPacket({ type: "ready", nonce: hook.nonce, cols, rows }));
const type = (text: string) => act(async () => hook.onPacket({ type: "input", nonce: hook.nonce, dataBase64: Buffer.from(text, "utf8").toString("base64") }));
const configured = () => posted.filter((packet) => packet.type === "configure").at(-1);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  posted.length = 0; inputs.length = 0; sizes.length = 0;
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

it("replays the PTY output unchanged, reports the fitted size and takes keys only once live", async () => {
  await render(props({ output: { output: "\u001b[32mPS C:\\repo>\u001b[0m ", cursor: 21 } }));
  expect(hook.ready).toBe(false);
  await ready(40, 10);
  expect(sizes).toEqual([[40, 10]]);
  // Replayed history may hold terminal queries; their replies must not reach the shell.
  expect(configured()).toMatchObject({ active: false });
  expect(hook.ready).toBe(false);
  expect(await screenText()).toBe("\u001b[32mPS C:\\repo>\u001b[0m ");
  expect(hook.ready).toBe(true);
  expect(configured()).toMatchObject({ active: true, freshPty: false, theme: { background: "bg", foreground: "fg", red: "c1", brightRed: "c9", brightWhite: "c15" } });
  await act(async () => hook.onPacket({ type: "resize", nonce: hook.nonce, cols: 50, rows: 12 }));
  expect(sizes.at(-1)).toEqual([50, 12]);
});

it("sends every keystroke raw, with Enter as CR, and draws nothing locally", async () => {
  await render(props());
  await ready();
  await screenText();
  await type("ls -la");
  await type("\t");
  await type("\r");
  await type("\u007f");
  expect(inputs).toEqual(["ls -la", "\t", "\r", "\u007f"]);
  // The shell echoes; the view only shows what the Host returns.
  expect(posted.filter((packet) => packet.type === "output")).toHaveLength(0);
  await act(async () => hook.sendKey("enter"));
  expect(inputs.at(-1)).toBe("\r");
});

it("shows only new output after the cursor and marks a cut tail", async () => {
  await render(props({ output: { output: "one\r\n", cursor: 5 } }));
  await ready();
  expect(await screenText()).toBe("one\r\n");
  await render(props({ output: { output: "one\r\ntwo\r\n", cursor: 10 } }));
  expect(await screenText()).toBe("two\r\n");
  // The same cursor again (a repeated poll) adds nothing.
  await render(props({ output: { output: "one\r\ntwo\r\n", cursor: 10 } }));
  expect(await screenText()).toBe("");
  // More arrived than the retained tail holds: mark the gap and show the tail.
  await render(props({ output: { output: "tail\r\n", cursor: 100 } }));
  const text = await screenText();
  expect(text).toContain("…");
  expect(text.endsWith("tail\r\n")).toBe(true);
});

it("posts one output packet at a time and continues after each acknowledgement", async () => {
  await render(props());
  await ready();
  await render(props({ output: { output: "x".repeat(9000), cursor: 9000 } }));
  const outputs = () => posted.filter((packet) => packet.type === "output");
  expect(outputs().map((packet) => packet.after)).toEqual([0]);
  await screenText();
  expect(outputs().map((packet) => packet.after)).toEqual([0, 1]);
});

it("applies the sticky modifiers to the next typed key or key-bar key and pastes line breaks as Enter", async () => {
  await render(props());
  await ready();
  await screenText();
  await act(async () => hook.toggleModifier("ctrl"));
  expect(hook.modifiers).toEqual({ ctrl: true, alt: false });
  await type("c");
  expect(hook.modifiers).toEqual({ ctrl: false, alt: false });
  expect(inputs).toEqual(["\u0003"]);
  await act(async () => hook.toggleModifier("ctrl"));
  await act(async () => hook.sendKey("left"));
  expect(hook.modifiers.ctrl).toBe(false);
  await act(async () => hook.toggleModifier("alt"));
  await act(async () => hook.toggleModifier("ctrl"));
  expect(hook.modifiers).toEqual({ ctrl: true, alt: true });
  await type("x");
  await act(async () => hook.toggleModifier("alt"));
  await act(async () => hook.toggleModifier("alt"));
  expect(hook.modifiers.alt).toBe(false);
  await act(async () => hook.sendKey("up"));
  await act(async () => hook.sendKey("escape"));
  await act(async () => hook.sendKey("tab"));
  await act(async () => hook.toggleModifier("alt"));
  await act(async () => hook.sendKey("clear"));
  expect(hook.modifiers.alt).toBe(false);
  await act(async () => hook.sendKey("pipe"));
  await act(async () => hook.toggleModifier("ctrl"));
  await act(async () => hook.paste("pasted\rline"));
  expect(hook.modifiers.ctrl).toBe(true);
  expect(inputs).toEqual(["\u0003", "\u001b[1;5D", "\u001b\u0018", "\u001b[A", "\u001b", "\t", "\u000c", "|", "pasted\rline"]);
});

it("ignores typing while disabled and rebuilds after the web view is lost", async () => {
  await render(props({ enabled: false }));
  await ready();
  await screenText();
  expect(configured()).toMatchObject({ active: false });
  await type("x");
  await act(async () => hook.sendKey("up"));
  await act(async () => hook.paste("x"));
  expect(inputs).toEqual([]);
  const first = hook.nonce;
  await act(async () => hook.onLost());
  expect(hook.nonce).not.toBe(first);
  expect(hook.ready).toBe(false);
});

it("stays inactive until the first output read arrives and is replayed", async () => {
  await render(props({ output: undefined }));
  await ready();
  expect(hook.ready).toBe(false);
  expect(configured()).toMatchObject({ active: false });
  await type("\u001b[1;1R");
  expect(inputs).toEqual([]);
  await render(props({ output: { output: "\u001b[6n$ ", cursor: 6 } }));
  expect(hook.ready).toBe(false);
  expect(await screenText()).toBe("\u001b[6n$ ");
  expect(hook.ready).toBe(true);
  expect(configured()).toMatchObject({ active: true });
});
