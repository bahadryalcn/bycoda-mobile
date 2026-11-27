import { describe, expect, it } from "vitest";
import {
  fileChipString,
  fileChipText,
  fileReferenceKind,
  FILE_CHIP_END,
  inlineCodeFilePath,
  isKnownFileType,
  splitFileLocation,
} from "./message-file-ref";

describe("file reference kind", () => {
  it("maps names to the desktop kinds, ignoring a trailing line location", () => {
    expect(fileReferenceKind("src/app.tsx:12")).toBe("code");
    expect(fileReferenceKind("index.html")).toBe("markup");
    expect(fileReferenceKind("README.md#L3")).toBe("docs");
    expect(fileReferenceKind("package.json")).toBe("data");
    expect(fileReferenceKind("shot.png")).toBe("media");
    expect(fileReferenceKind("dist.zip")).toBe("archive");
    expect(fileReferenceKind("src/ui/")).toBe("folder");
    expect(fileReferenceKind("Dockerfile")).toBe("code");
    expect(fileReferenceKind(".env.local")).toBe("data");
    expect(fileReferenceKind("notes.unknown")).toBe("other");
  });
  it("does not treat dotted identifiers as files", () => {
    expect(isKnownFileType("images.generate")).toBe(false);
    expect(isKnownFileType("console.log")).toBe(false);
    expect(isKnownFileType("app.ts")).toBe(true);
  });
});

describe("line locations", () => {
  it("splits colon and #L forms", () => {
    expect(splitFileLocation("a.ts:711")).toEqual({ name: "a.ts", location: "L711" });
    expect(splitFileLocation("a.ts:711:5")).toEqual({ name: "a.ts", location: "L711:5" });
    expect(splitFileLocation("a.ts#L13-L20")).toEqual({ name: "a.ts", location: "L13-20" });
    expect(splitFileLocation("a.ts")).toEqual({ name: "a.ts" });
    expect(splitFileLocation(":12")).toEqual({ name: ":12" });
  });
});

describe("inline code file detection", () => {
  it("accepts relative paths and bare names of recognised file types", () => {
    expect(inlineCodeFilePath("src/ui/chat.tsx")).toBe("src/ui/chat.tsx");
    expect(inlineCodeFilePath(" README.md:4 ")).toBe("README.md:4");
    expect(inlineCodeFilePath("C:\\repo\\a.ts")).toBe("C:\\repo\\a.ts");
  });
  it("keeps commands, identifiers, URLs and snippets as neutral code", () => {
    for (const value of ["/compact", "/usr/bin/env", "console.log", "pnpm test", "https://x.dev/a.ts", "--flag.json", "a.ts()", "me@host.com", "src/ui/"])
      expect(inlineCodeFilePath(value)).toBeNull();
  });
});

describe("chip text", () => {
  it("shows the leaf name and a quieter location for path labels", () => {
    expect(fileChipText("src/ui/chat.tsx:12", "src/ui/chat.tsx:12")).toEqual({ name: "chat.tsx", location: "L12" });
    expect(fileChipText("chat.tsx", "src/ui/chat.tsx#L4")).toEqual({ name: "chat.tsx", location: "L4" });
  });
  it("keeps a custom link label as written and takes the location from the target", () => {
    expect(fileChipText("the config", "src/config.ts:9")).toEqual({ name: "the config", location: "L9" });
    expect(fileChipText("x", "file:///C:/r/a.ts")).toEqual({ name: "x", location: undefined });
  });
  it("renders the same characters the selection layer receives", () => {
    expect(fileChipString("src/a.ts:3", "src/a.ts:3")).toBe(`a.ts · L3${FILE_CHIP_END}`);
    expect(fileChipString("a.ts", "a.ts")).toBe(`a.ts${FILE_CHIP_END}`);
  });
});
