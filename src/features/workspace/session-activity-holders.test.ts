import { expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { BROWSER_HOLDER_CAPABILITY, DEVICE_HOLDER_CAPABILITY, browserHostLabel, inferHolders, resolveHolders } from "./session-activity-holders";

const user = { id: "u", role: "user", text: "go" } as Block;
const tool = (id: string, title: string, extra: Partial<Block["tool"]> = {}): Block => ({ id, role: "tool", text: "", tool: { title, status: "completed", ...extra } } as Block);
const device = (id: string, heldBy?: unknown) => ({ id, name: id, platform: "android", version: "15", booted: true, physical: false, heldBy }) as never;
const base = { sessionId: "s1", live: true, blocks: undefined, devices: undefined, browserStatus: undefined };

it("trusts Host holders when the capability is present and ignores other holders", () => {
  const caps = [DEVICE_HOLDER_CAPABILITY, BROWSER_HOLDER_CAPABILITY];
  const holders = resolveHolders({ ...base, capabilities: caps, devices: [device("a", { kind: "session", sessionId: "other" }), device("b", { kind: "session", sessionId: "s1" }), device("c", { kind: "controller" })],
    browserStatus: { url: "http://localhost:5173/x", heldBy: { kind: "session", sessionId: "s1" } } });
  expect(holders).toEqual({ device: { deviceId: "b", inferred: false }, browser: { url: "http://localhost:5173/x", inferred: false } });
  expect(resolveHolders({ ...base, capabilities: caps, browserStatus: { url: "http://x", heldBy: { kind: "controller" } } })).toEqual({});
});

it("does not infer from the transcript when the Host reports holders", () => {
  const blocks = [user, tool("t", "mcp__t3-code__device_open")];
  expect(resolveHolders({ ...base, capabilities: [DEVICE_HOLDER_CAPABILITY], blocks, devices: [] })).toEqual({});
});

it("falls back to the latest unclosed open in the running turn on an older Host", () => {
  const open = tool("t", "mcp__t3-code__device_open"), close = tool("c", "mcp__t3-code__device_close");
  expect(inferHolders([user, open], true)).toEqual({ device: { inferred: true } });
  expect(inferHolders([user, open, close], true)).toEqual({});
  expect(inferHolders([open, user], true)).toEqual({});
  expect(inferHolders([user, open], false)).toEqual({});
  expect(inferHolders([user, tool("f", "device_open", { status: "failed" })], true)).toEqual({});
  const page = tool("p", "mcp__t3-code__preview_open", { detail: "opened http://localhost:5173/app" });
  expect(inferHolders([user, page], true)).toEqual({ browser: { url: "http://localhost:5173/app", inferred: true } });
  expect(inferHolders([user, page, tool("pc", "mcp__t3-code__t3_preview_close")], true)).toEqual({});
  expect(inferHolders([user, tool("x", "my_device_opener")], true)).toEqual({});
});

it("labels a page by host", () => {
  expect(browserHostLabel("http://localhost:5173/a?b")).toBe("localhost:5173");
  expect(browserHostLabel("nonsense")).toBeUndefined();
  expect(browserHostLabel(undefined)).toBeUndefined();
});
