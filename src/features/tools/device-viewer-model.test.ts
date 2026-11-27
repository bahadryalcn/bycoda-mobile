import { expect, it } from "vitest";
import {
  appTargetValid,
  frameBlocker,
  knownAppName,
  previewServerUrls,
  recentApps,
  rememberApp,
  viewerFrameEdge,
} from "./device-viewer-model";
import type { DevServer } from "./types";

it("asks for a frame no larger than the viewer can show, within bounds", () => {
  expect(viewerFrameEdge({ width: 390, height: 600 }, 3)).toBe(1080);
  expect(viewerFrameEdge({ width: 200, height: 300 }, 2)).toBe(600);
  expect(viewerFrameEdge({ width: 50, height: 60 }, 1)).toBe(320);
  expect(viewerFrameEdge({ width: 300, height: 400 }, Number.NaN)).toBe(800);
});

it("names the fixable reasons a screen cannot be shown", () => {
  expect(frameBlocker(new Error("Device hub is stopped"))).toBe("service-stopped");
  expect(frameBlocker(new Error("Boot the device before viewing"))).toBe("device-off");
  expect(frameBlocker(new Error("Request timed out"))).toBeUndefined();
});

it("validates app targets the way the computer will", () => {
  expect(appTargetValid("com.android.chrome", "android")).toBe(true);
  expect(appTargetValid("Settings", "android")).toBe(true);
  expect(appTargetValid("chrome", "android")).toBe(false);
  expect(appTargetValid("  ", "android")).toBe(false);
  expect(appTargetValid("com.apple.mobilesafari", "ios")).toBe(true);
  expect(appTargetValid("--help", "ios")).toBe(false);
});

it("remembers recently opened apps per computer and platform, newest first", () => {
  rememberApp("a", "android", "com.one.app");
  rememberApp("a", "android", "com.two.app");
  rememberApp("a", "android", "com.one.app");
  expect(recentApps("a", "android")).toEqual(["com.one.app", "com.two.app"]);
  expect(recentApps("b", "android")).toEqual([]);
  expect(recentApps("a", "ios")).toEqual([]);
});

it("suggests this project's running dev servers, Expo first", () => {
  const server = (id: string, extra: Partial<DevServer>): DevServer => ({
    id, name: id, managed: true, state: "running", association: "managed", logsAvailable: false,
    projectId: "project", endpoints: [{ address: "127.0.0.1", port: 3000, url: `http://127.0.0.1:${id.length}000` }],
    ...extra,
  } as DevServer);
  expect(previewServerUrls([
    server("vite", { command: "vite" }),
    server("expo", { command: "npx expo start", endpoints: [{ address: "127.0.0.1", port: 8081, url: "http://127.0.0.1:8081" }] }),
    server("other", { projectId: "elsewhere" }),
    server("stopped", { state: "stopped" }),
  ], "project")).toEqual([
    { name: "expo", url: "http://127.0.0.1:8081" },
    { name: "vite", url: "http://127.0.0.1:4000" },
  ]);
});

it("names the suggested system apps and leaves typed IDs as they are", () => {
  const en = (_tr: string, text: string) => text;
  expect(knownAppName("com.android.settings", en)).toBe("Settings");
  expect(knownAppName("host.exp.Exponent", en)).toBe("Expo Go");
  expect(knownAppName("com.example.app", en)).toBeUndefined();
});
