import { describe, expect, it } from "vitest";
import { attachmentKind, attachmentPlan, downloadNeedsConfirmation, formatAttachmentSize, INLINE_AUTO_BYTES } from "./media-inline-policy";
import { MAX_MEDIA_BYTES } from "./media-policy";

describe("inline attachment policy", () => {
  it("detects kinds from mime then name", () => {
    expect(attachmentKind("a.png")).toBe("image");
    expect(attachmentKind("a.gif", "image/gif")).toBe("image");
    expect(attachmentKind("x", "application/pdf")).toBe("pdf");
    expect(attachmentKind("README.md", "application/octet-stream")).toBe("markdown");
    expect(attachmentKind("report.PDF", "Application/Octet-Stream; charset=binary")).toBe("pdf");
    expect(attachmentKind("report", "Application/PDF; version=1.7")).toBe("pdf");
    expect(attachmentKind("clip.mp4")).toBe("video");
    expect(attachmentKind("pic.svg")).toBe("file");
    expect(attachmentKind("generated-image", undefined, true)).toBe("image");
    expect(attachmentKind("a.zip")).toBe("file");
  });
  it("auto-loads only known images within 4 MB", () => {
    expect(attachmentPlan("image", INLINE_AUTO_BYTES)).toBe("inline");
    expect(attachmentPlan("image", INLINE_AUTO_BYTES + 1)).toBe("download");
    expect(attachmentPlan("image", undefined)).toBe("download");
    expect(attachmentPlan("pdf", 10)).toBe("download");
    expect(attachmentPlan("video", MAX_MEDIA_BYTES + 1)).toBe("too-large");
    expect(attachmentPlan("image", Number.NaN)).toBe("too-large");
  });
  it("confirms large or unknown downloads", () => {
    expect(downloadNeedsConfirmation("pdf", 500 * 1024)).toBe(false);
    expect(downloadNeedsConfirmation("pdf", 2 * 1024 * 1024)).toBe(true);
    expect(downloadNeedsConfirmation("image", 5 * 1024 * 1024)).toBe(true);
    expect(downloadNeedsConfirmation("file", undefined)).toBe(true);
  });
  it("formats sizes", () => {
    expect(formatAttachmentSize(1029 * 1024)).toBe("1.0 MB");
    expect(formatAttachmentSize(100)).toBe("1 KB");
  });
});
