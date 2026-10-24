// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentContent } from "./document-content";

const sharing = vi.hoisted(() => ({ share: vi.fn().mockRejectedValue(new Error("Cached file no longer exists")) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: sharing.share }));
vi.mock("./media-loader", () => ({ loadProjectMedia: vi.fn() }));
vi.mock("./message-content", () => ({ MessageContent: () => null }));
vi.mock("./message-image", () => ({ MessageImage: () => null }));
vi.mock("./html-document", () => ({ HtmlDocument: () => null }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./tokens", () => ({ space: { sm: 8 } }));
vi.mock("./primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: wrapper, Row: wrapper, CodePanel: wrapper, CodeText: wrapper, Loading: () => null,
    ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", { role: "alert" }, String(error)) : null,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label) };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const cache = new QueryClient();
afterEach(async () => { await act(async () => root?.unmount()); cache.clear(); vi.unstubAllGlobals(); });

it("offers parent media reload after an evicted PDF fails to share", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  const reload = vi.fn();
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(DocumentContent, { name: "report.pdf", mimeType: "application/pdf", uri: "file:///evicted.pdf", onReload: reload }))));
  await act(async () => container.querySelector("button")!.click());
  expect(sharing.share).toHaveBeenCalledWith("file:///evicted.pdf", expect.anything());
  expect(container.textContent).toContain("Cached file no longer exists");
  const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reload file")!;
  await act(async () => retry.click());
  expect(reload).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
