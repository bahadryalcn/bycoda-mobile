// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type RuntimeWindow = Window & {
  byCodaPdfStart(options: { base64: string; labels: { error: string } }): Promise<void>;
  byCodaPdfStop(): void;
};
const runtime = window as unknown as RuntimeWindow;
const source = readFileSync(resolve("src/ui/pdf-viewer-runtime.js"), "utf8");
// Replace only module imports: execute production lifecycle/error/render code unchanged.
const imports = source.match(/^import .+ from .+;\r?$/gm);
const executable = source.replace(/^import .+ from .+;\r?\n/gm, "");
const getDocument = vi.fn(), destroy = vi.fn(), render = vi.fn();
const error = () => document.getElementById("error")!;
const start = (base64 = "JVBERg==") => runtime.byCodaPdfStart({ base64, labels: { error: "PDF could not open" } });
const settle = async () => { for (let tick = 0; tick < 20; tick++) await Promise.resolve(); };
function documentTask() {
  return {
    promise: Promise.resolve({ numPages: 1, getPage: async () => ({
      cleanup() {}, getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
      render, getTextContent: async () => ({ items: [] }),
    }) }),
    destroy,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  destroy.mockReset().mockResolvedValue(undefined);
  render.mockReset().mockImplementation(() => ({ promise: Promise.resolve(), cancel() {} }));
  getDocument.mockReset().mockImplementation(documentTask);
  document.body.innerHTML = `<button id="previous"></button><button id="next"></button>
    <button id="zoom-out"></button><button id="zoom-in"></button><button id="fit"></button>
    <span id="page-status"></span><div id="viewport"><div id="page"><canvas id="canvas"></canvas>
    <div id="text-layer"></div></div></div><p id="status"></p><p id="error" hidden></p>
    <form id="password-form" hidden><input id="password"><p id="password-error"></p>
    <button id="password-submit"></button></form>`;
  Object.defineProperty(document.getElementById("viewport"), "clientWidth", { value: 390 });
  document.getElementById("viewport")!.scrollTo = vi.fn();
  vi.stubGlobal("devicePixelRatio", 1);
  expect(imports).toHaveLength(3);
  new Function("getDocument", "TextLayer", "PasswordResponses", "resources", "WorkerMessageHandler", executable)(
    getDocument, class { render() { return Promise.resolve(); } cancel() {} },
    { INCORRECT_PASSWORD: 2 }, {}, {},
  );
});
afterEach(() => {
  runtime.byCodaPdfStop();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers(); vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).pdfjsWorker;
  delete (window as unknown as Record<string, unknown>).byCodaPdfStart;
  delete (window as unknown as Record<string, unknown>).byCodaPdfStop;
  document.body.replaceChildren();
});

it("unhides a corrupt-data error and hides it immediately when a new opening starts", async () => {
  await start("%%%%");
  expect(getDocument).not.toHaveBeenCalled();
  expect(error().hidden).toBe(false); expect(error().textContent).toBe("PDF could not open");
  const retry = start();
  expect(error().hidden).toBe(true); expect(error().textContent).toBe("");
  await retry;
  expect(error().hidden).toBe(true); expect(document.getElementById("page-status")!.textContent).toBe("Page 1 of 1");
});

it("makes a PDF.js document rejection visible and clears it on successful retry", async () => {
  getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error("Private parser detail")), destroy }));
  await start();
  expect(error().hidden).toBe(false); expect(error().textContent).toBe("PDF could not open");
  expect(document.body.textContent).not.toContain("Private parser detail");
  expect(vi.getTimerCount()).toBe(0);
  await start();
  expect(error().hidden).toBe(true); expect(error().textContent).toBe("");
  expect(destroy).toHaveBeenCalledTimes(1);
});

it("hides a rendering error as the same reader retries with fit-to-width", async () => {
  render.mockImplementationOnce(() => ({ promise: Promise.reject(new Error("Canvas failed")), cancel() {} }));
  await start(); expect(error().hidden).toBe(false);
  document.getElementById("fit")!.click();
  expect(error().hidden).toBe(true); expect(error().textContent).toBe("");
  await settle();
  expect(error().hidden).toBe(true); expect(render).toHaveBeenCalledTimes(2);
  expect(document.getElementById("viewport")!.getAttribute("aria-busy")).toBe("false");
});
