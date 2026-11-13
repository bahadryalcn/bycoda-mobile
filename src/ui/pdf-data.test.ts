import { afterEach, describe, expect, it, vi } from "vitest";
import { checkedPdfBase64, pdfPositionMessage, readPdfData } from "./pdf-data";

const files = vi.hoisted(() => ({ exists: true, size: 4, read: vi.fn(), opened: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class {
  exists = files.exists;
  size = files.size;
  constructor(uri: string) { files.opened(uri); }
  base64() { return files.read(); }
} }));
// Exercise both encoded-length and decoded-byte boundaries without allocating 20 MiB fixtures.
vi.mock("./media-policy", () => ({ MAX_MEDIA_BYTES: 5 }));
afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks();
  files.exists = true; files.size = 4;
});

describe("PDF data trust boundary", () => {
  it.each(["", "abc", "!!!!", "AA=A", "AAAA\n", "AA===", "AAAA AAAA"])("rejects malformed base64 %j", value => {
    expect(() => checkedPdfBase64(value)).toThrow("Invalid or oversized PDF data.");
  });
  it("accepts exact decoded limit and rejects oversized encoded or decoded data", () => {
    expect(checkedPdfBase64("AAAAAAA=")).toBe("AAAAAAA=");
    expect(() => checkedPdfBase64("AAAAAAAA")).toThrow("PDF exceeds the preview limit.");
    expect(() => checkedPdfBase64("AAAAAAAAAAAA")).toThrow("Invalid or oversized PDF data.");
  });
  it("reads embedded PDF bytes without native files or network access", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await readPdfData("data:application/pdf;base64,JVBERg==")).toBe("JVBERg==");
    expect(files.opened).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["https://example.com/private.pdf", "http://localhost/a.pdf", "/tmp/a.pdf", "data:text/html;base64,AAAA", "blob:remote"])("rejects non-local native URI %s", async uri => {
    vi.stubEnv("EXPO_OS", "ios");
    await expect(readPdfData(uri)).rejects.toThrow("PDF preview requires a downloaded file.");
    expect(files.opened).not.toHaveBeenCalled();
  });
  it.each(["file:///private/a.pdf", "content://documents/a"])("reads only existing bounded native file %s", async uri => {
    vi.stubEnv("EXPO_OS", "android"); files.read.mockResolvedValue("JVBERg==");
    expect(await readPdfData(uri)).toBe("JVBERg=="); expect(files.opened).toHaveBeenCalledWith(uri);
    files.exists = false;
    await expect(readPdfData(uri)).rejects.toThrow("PDF is unavailable or exceeds the preview limit.");
    files.exists = true; files.size = 6;
    await expect(readPdfData(uri)).rejects.toThrow("PDF is unavailable or exceeds the preview limit.");
    expect(files.read).toHaveBeenCalledTimes(1);
  });
  it("honors cancellation before I/O and after pending native read", async () => {
    vi.stubEnv("EXPO_OS", "ios");
    const before = new AbortController(); before.abort();
    await expect(readPdfData("file:///a.pdf", before.signal)).rejects.toThrow("PDF preview cancelled.");
    expect(files.opened).not.toHaveBeenCalled();
    const during = new AbortController();
    files.read.mockImplementation(async () => { during.abort(); return "JVBERg=="; });
    await expect(readPdfData("file:///a.pdf", during.signal)).rejects.toThrow("PDF preview cancelled.");
  });
  it("does not accept file or network URIs in the web reader", async () => {
    vi.stubEnv("EXPO_OS", "web"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const uri of ["file:///a.pdf", "content://a", "https://example.com/a.pdf"])
      await expect(readPdfData(uri)).rejects.toThrow("PDF preview requires a downloaded file.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fetches web blobs without credentials and rejects oversized blobs before decoding", async () => {
    vi.stubEnv("EXPO_OS", "web");
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => ({ size: 6 }) });
    vi.stubGlobal("fetch", fetch); const signal = new AbortController().signal;
    await expect(readPdfData("blob:local", signal)).rejects.toThrow("PDF exceeds the preview limit.");
    expect(fetch).toHaveBeenCalledWith("blob:local", { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    fetch.mockResolvedValue({ ok: false });
    await expect(readPdfData("blob:expired")).rejects.toThrow("PDF file is unavailable.");
  });
});

describe("PDF position message scope", () => {
  const message = (values = {}) => JSON.stringify({ kind: "pdf-position", channel: "reader-current", page: 1, zoom: 1, ...values });
  it("accepts only current reader messages and bounded integer page/finite zoom", () => {
    expect(pdfPositionMessage(message({ page: 1_000_000, zoom: 3 }), "reader-current")).toEqual({ page: 1_000_000, zoom: 3 });
    expect(pdfPositionMessage(message({ zoom: 0.25 }), "reader-current")).toEqual({ page: 1, zoom: 0.25 });
    for (const values of [{ channel: "previous-reader" }, { kind: "navigate" }, { page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { page: "1" }, { zoom: 0.24 }, { zoom: 3.01 }, { zoom: null }, { zoom: "1" }])
      expect(pdfPositionMessage(message(values), "reader-current"), JSON.stringify(values)).toBeUndefined();
  });
  it.each([undefined, {}, "not JSON", "null", "[]", "1", "x".repeat(257)])("ignores malformed or oversized bridge messages %j", raw => {
    expect(pdfPositionMessage(raw, "reader-current")).toBeUndefined();
  });
});
