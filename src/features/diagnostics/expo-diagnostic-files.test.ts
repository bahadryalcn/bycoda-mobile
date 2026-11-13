import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ directories: [] as string[][], files: [] as { directory: unknown; name: string }[], unsupported: false, create: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock("expo-file-system", () => ({
  Paths: { document: "fixture-document" },
  Directory: class {
    constructor(...segments: string[]) { state.directories.push(segments); if (state.unsupported) throw new Error("Native filesystem unavailable"); }
    create = state.create;
  },
  File: class {
    exists = true;
    constructor(directory: unknown, name: string) { state.files.push({ directory, name }); }
    textSync() { return "saved marker"; }
    writeSync = state.write;
    delete = state.remove;
  },
}));
import { expoDiagnosticFiles } from "./expo-diagnostic-files";
beforeEach(() => { state.directories = []; state.files = []; state.unsupported = false; state.create.mockClear(); state.write.mockClear(); state.remove.mockClear(); });
it("creates a diagnostics adapter without constructing the native directory", () => {
  state.unsupported = true;
  const files = expoDiagnosticFiles();
  expect(state.directories).toHaveLength(0);
  expect(files.read("crash.json")).toBeNull();
  expect(() => files.remove("crash.json")).not.toThrow();
});
it("lazily reuses the same native diagnostics directory for file operations", () => {
  const files = expoDiagnosticFiles();
  expect(state.directories).toHaveLength(0);
  files.write("crash.json", "marker");
  expect(files.read("crash.json")).toBe("saved marker");
  files.remove("crash.json");
  expect(state.directories).toEqual([["fixture-document", "diagnostics"]]);
  expect(state.files.map(file => file.name)).toEqual(["crash.json", "crash.json", "crash.json"]);
  expect(new Set(state.files.map(file => file.directory)).size).toBe(1);
  expect(state.create).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
  expect(state.write).toHaveBeenCalledWith("marker");
  expect(state.remove).toHaveBeenCalledOnce();
});
