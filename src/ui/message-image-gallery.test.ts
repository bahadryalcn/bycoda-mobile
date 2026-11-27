import { describe, expect, it } from "vitest";
import { parseMessage } from "./message-model";
import { messageGalleryPage, messageImageKind, messageImageNodes } from "./message-image-gallery";

const sources = (text: string) => messageImageNodes(parseMessage(text)).map((node) => node.attrs.src);

describe("message image gallery pages", () => {
  it("collects the shown images in reading order across paragraphs, lists and quotes", () => {
    const text = "![a](a.png) text ![b](b.png)\n\n- item ![c](c.png)\n  - nested ![d](d.png)\n\n> ![e](e.png)\n\n## ![f](f.png)";
    expect(sources(text)).toEqual(["a.png", "b.png", "c.png", "d.png", "e.png", "f.png"]);
  });

  it("skips images that draw no frame: tables, code and formulas", () => {
    const text = "| x |\n| --- |\n| ![t](t.png) |\n\n```md\n![code](c.png)\n```\n\n`![inline](i.png)`\n\n![kept](k.png)";
    expect(sources(text)).toEqual(["k.png"]);
  });

  it("includes an image inside a link and task list items", () => {
    expect(sources("[![badge](b.png)](https://example.com) and more")).toEqual(["b.png"]);
    expect(sources("- [x] done ![shot](s.png)")).toEqual(["s.png"]);
  });

  it("returns the same node objects the renderer receives, so a tap maps to its page", () => {
    const nodes = parseMessage("![a](a.png)\n\n![b](b.png)");
    const images = messageImageNodes(nodes);
    expect(images[1]).toBe(nodes[1]!.children[0]!.children[0]);
  });

  it("classifies image sources", () => {
    expect(messageImageKind("/note-assets/x.png", false)).toBe("note");
    expect(messageImageKind("data:image/png;base64,AAAA", false)).toBe("data");
    expect(messageImageKind("https://example.com/x.png", true)).toBe("external");
    expect(messageImageKind("out/chart.png", false)).toBe("project");
  });

  it("states each page: consent for web images, loading, failure and unavailable", () => {
    const base = { hasContext: true, allowed: false, failed: false };
    expect(messageGalleryPage({ ...base, kind: "external" })).toEqual({ status: "download" });
    expect(messageGalleryPage({ ...base, kind: "external", allowed: true, uri: "https://x/y.png" })).toEqual({ uri: "https://x/y.png" });
    expect(messageGalleryPage({ ...base, kind: "project" })).toEqual({ status: "loading" });
    expect(messageGalleryPage({ ...base, kind: "project", failed: true })).toEqual({ status: "failed" });
    expect(messageGalleryPage({ ...base, kind: "project", uri: "file:///c/x.png" })).toEqual({ uri: "file:///c/x.png" });
    expect(messageGalleryPage({ ...base, kind: "project", hasContext: false })).toEqual({ status: "unavailable" });
    expect(messageGalleryPage({ ...base, kind: "note" })).toEqual({ status: "unavailable" });
    expect(messageGalleryPage({ ...base, kind: "data" })).toEqual({ status: "unavailable" });
  });
});

describe("linked images", () => {
  it("parses an image wrapped in a file link as an image inside a link, not a broken chip", () => {
    const nodes = parseMessage("[![shot](docs/shot.png)](docs/shot.png) done");
    const paragraph = nodes[0]!.children[0]!.children;
    expect(paragraph[0]!.type).toBe("link");
    expect(paragraph[0]!.attrs.href).toBe("docs/shot.png");
    expect(paragraph[0]!.children.map((node) => node.type)).toEqual(["image"]);
    expect(messageImageNodes(nodes).map((node) => node.attrs.src)).toEqual(["docs/shot.png"]);
  });
});
