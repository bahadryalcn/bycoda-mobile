import { getDocument, TextLayer, PasswordResponses } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import resources from "bycoda:pdf-resources";

// PDF.js uses its local message-loop worker when this handler already exists.
// No worker URL, document URL, embedded PDF script or remote resource is loaded.
globalThis.pdfjsWorker = { WorkerMessageHandler };
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;
const MAX_DIMENSION = 4096;
const DEADLINE_MS = 30_000;
let retire = () => {};

function bytes(value) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

class LocalBinaryDataFactory {
  async fetch({ kind, filename }) {
    const group = resources[kind];
    if (!group || !Object.hasOwn(group, filename)) throw new Error("PDF resource is unavailable");
    return bytes(group[filename]);
  }
}

function startSession({ base64, locale, labels = {}, channel = "", page: initialPage, zoom: initialZoom }) {
  const find = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing PDF view element: ${id}`);
    return element;
  };
  const previous = find("previous"), next = find("next");
  const zoomOut = find("zoom-out"), zoomIn = find("zoom-in"), fit = find("fit");
  const pageStatus = find("page-status"), viewport = find("viewport"), pageBox = find("page");
  const canvas = find("canvas"), textContainer = find("text-layer");
  const status = find("status"), error = find("error"), passwordForm = find("password-form");
  const password = find("password"), passwordError = find("password-error"), passwordSubmit = find("password-submit");
  const listeners = new AbortController();
  const number = new Intl.NumberFormat(locale);
  let active = true, pdf, loadingTask, rendering, textLayer, currentPage;
  let renderQueue = Promise.resolve(), revision = 0;
  let pageNumber = Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1;
  let zoom = Number.isFinite(initialZoom) ? Math.max(0.25, Math.min(3, initialZoom)) : 1;
  let passwordReply, loadTimer, renderTimer, resizeTimer;
  const label = (key, fallback) => typeof labels[key] === "string" ? labels[key] : fallback;
  const loading = () => { status.textContent = label("loading", "Loading…"); };
  const controls = () => {
    previous.disabled = !pdf || pageNumber <= 1;
    next.disabled = !pdf || pageNumber >= pdf.numPages;
    zoomOut.disabled = !pdf || zoom <= 0.25;
    zoomIn.disabled = !pdf || zoom >= 3;
    fit.disabled = !pdf;
  };
  const failed = () => {
    if (!active) return;
    clearTimeout(loadTimer); clearTimeout(renderTimer);
    status.textContent = "";
    error.textContent = label("error", "PDF could not be opened. Use Share / save to open it in another app.");
    error.hidden = false;
    viewport.setAttribute("aria-busy", "false");
  };
  function deadline() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      failed();
      void loadingTask?.destroy().catch(() => {});
    }, DEADLINE_MS);
  }
  function requestRender(resetPosition = false) {
    const request = ++revision;
    rendering?.cancel(); textLayer?.cancel();
    clearTimeout(renderTimer);
    loading(); error.textContent = ""; error.hidden = true;
    viewport.setAttribute("aria-busy", "true");
    renderTimer = setTimeout(() => {
      if (request !== revision || !active) return;
      revision++; rendering?.cancel(); textLayer?.cancel(); failed();
    }, DEADLINE_MS);
    renderQueue = renderQueue.catch(() => {}).then(async () => {
      if (!active || request !== revision || !pdf) return;
      currentPage?.cleanup();
      const page = await pdf.getPage(pageNumber);
      if (!active || request !== revision) { page.cleanup(); return; }
      currentPage = page;
      const base = page.getViewport({ scale: 1 });
      if (![base.width, base.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid PDF page size");
      const padding = getComputedStyle(viewport);
      const available = Math.max(1, viewport.clientWidth - (parseFloat(padding.paddingLeft) || 0) - (parseFloat(padding.paddingRight) || 0));
      const scale = Math.min(available / base.width * zoom, MAX_DIMENSION / base.width, MAX_DIMENSION / base.height);
      const pageView = page.getViewport({ scale });
      const pixels = Math.min(Math.max(1, devicePixelRatio || 1), 2, MAX_DIMENSION / pageView.width,
        MAX_DIMENSION / pageView.height, Math.sqrt(MAX_PIXELS / (pageView.width * pageView.height)));
      canvas.width = Math.max(1, Math.floor(pageView.width * pixels));
      canvas.height = Math.max(1, Math.floor(pageView.height * pixels));
      canvas.style.width = `${pageView.width}px`; canvas.style.height = `${pageView.height}px`;
      canvas.setAttribute("aria-hidden", "true");
      pageBox.style.width = `${pageView.width}px`; pageBox.style.height = `${pageView.height}px`;
      pageBox.style.setProperty("--total-scale-factor", String(scale));
      textContainer.replaceChildren(); textContainer.classList.add("textLayer");
      textContainer.setAttribute("role", "document");
      rendering = page.render({ canvas, viewport: pageView, transform: pixels === 1 ? null : [pixels, 0, 0, pixels, 0, 0],
        annotationMode: 0 });
      // Observe both tasks immediately so cancellation never leaves an unhandled rejection.
      const rendered = rendering.promise;
      void rendered.catch(() => {});
      const text = await page.getTextContent({ includeMarkedContent: true });
      if (!active || request !== revision) { await rendered.catch(() => {}); return; }
      textLayer = new TextLayer({ textContentSource: text, container: textContainer, viewport: pageView });
      await Promise.all([rendered, textLayer.render()]);
      if (!active || request !== revision) return;
      clearTimeout(renderTimer);
      const title = label("page", "Page {p0} of {p1}")
        .replaceAll("{p0}", number.format(pageNumber)).replaceAll("{p1}", number.format(pdf.numPages));
      pageStatus.textContent = title; textContainer.setAttribute("aria-label", title);
      status.textContent = ""; viewport.setAttribute("aria-busy", "false");
      if (typeof channel === "string" && channel.length <= 512) {
        const position = JSON.stringify({ kind: "pdf-position", channel, page: pageNumber, zoom });
        window.ReactNativeWebView?.postMessage(position);
        if (window.parent !== window) window.parent.postMessage(position, "*");
      }
      if (resetPosition) viewport.scrollTo(0, 0);
      controls();
    }).catch(() => { if (active && request === revision) failed(); });
    return renderQueue;
  }
  const listen = (target, event, callback) => target.addEventListener(event, callback, { signal: listeners.signal });
  const changePage = delta => {
    if (!active || !pdf || pageNumber + delta < 1 || pageNumber + delta > pdf.numPages) return;
    pageNumber += delta; controls(); void requestRender(true);
  };
  const changeZoom = delta => {
    if (!active || !pdf) return;
    zoom = Math.max(0.25, Math.min(3, zoom + delta)); controls(); void requestRender();
  };
  for (const [control, key] of [[previous, "previous"], [next, "next"], [zoomIn, "zoomIn"],
    [zoomOut, "zoomOut"], [fit, "fit"]]) {
    if (typeof labels[key] === "string") control.setAttribute("aria-label", labels[key]);
  }
  password.setAttribute("aria-label", label("password", "PDF password"));
  listen(previous, "click", () => changePage(-1)); listen(next, "click", () => changePage(1));
  listen(zoomOut, "click", () => changeZoom(-0.25)); listen(zoomIn, "click", () => changeZoom(0.25));
  listen(fit, "click", () => { if (pdf) { zoom = 1; controls(); void requestRender(); } });
  listen(passwordForm, "submit", event => {
    event.preventDefault();
    if (!active || !passwordReply || !password.value) return;
    const reply = passwordReply; passwordReply = undefined;
    const value = password.value; password.value = ""; passwordForm.hidden = true;
    loading(); deadline(); reply(value);
  });
  listen(viewport, "keydown", event => {
    if (event.target !== viewport) return;
    if (event.key === "PageDown") { event.preventDefault(); changePage(1); }
    if (event.key === "PageUp") { event.preventDefault(); changePage(-1); }
  });
  listen(window, "resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (active && pdf) void requestRender(); }, 100);
  });
  const cleanup = () => {
    if (!active) return;
    active = false; revision++; listeners.abort();
    clearTimeout(loadTimer); clearTimeout(renderTimer); clearTimeout(resizeTimer);
    rendering?.cancel(); textLayer?.cancel(); password.value = "";
    canvas.width = 0; canvas.height = 0; textContainer.replaceChildren();
    void loadingTask?.destroy().catch(() => {});
  };
  listen(window, "pagehide", cleanup); listen(window, "beforeunload", cleanup);
  passwordForm.hidden = true; error.textContent = ""; error.hidden = true; pageStatus.textContent = ""; controls(); loading();
  const ready = Promise.resolve().then(async () => {
    if (!active) return;
    if (typeof base64 !== "string" || base64.length === 0 || base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error("PDF exceeds preview limit");
    const data = bytes(base64);
    if (data.length === 0 || data.length > MAX_BYTES) throw new Error("PDF exceeds preview limit");
    loadingTask = getDocument({ data, BinaryDataFactory: LocalBinaryDataFactory, useWorkerFetch: false,
      useWasm: false, useSystemFonts: true, enableXfa: false, isImageDecoderSupported: false,
      maxImageSize: MAX_PIXELS, canvasMaxAreaInBytes: MAX_PIXELS * 4, disableAutoFetch: true,
      disableStream: true, verbosity: 0 });
    loadingTask.onPassword = (reply, reason) => {
      if (!active) return;
      clearTimeout(loadTimer); passwordReply = reply; status.textContent = "";
      passwordError.textContent = reason === PasswordResponses.INCORRECT_PASSWORD
        ? label("passwordIncorrect", "Incorrect password. Try again.") : "";
      passwordForm.hidden = false; passwordSubmit.disabled = false; password.focus();
    };
    deadline();
    pdf = await loadingTask.promise;
    if (!active) return;
    clearTimeout(loadTimer); passwordForm.hidden = true;
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw new Error("Empty PDF");
    pageNumber = Math.min(pageNumber, pdf.numPages);
    controls(); await requestRender(true);
  }).catch(failed);
  return { ready, cleanup };
}

window.byCodaPdfStart = config => {
  retire();
  const session = startSession(config);
  retire = session.cleanup;
  return session.ready;
};
window.byCodaPdfStop = () => retire();
