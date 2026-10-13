import { describe, expect, it } from "vitest";
import { documentDisplayName } from "./document-display-name";

describe("document preview display name", () => {
  it("decodes the linked filename once without changing its source path", () => {
    const path = "docs/guide%20with%20spaces.md";
    expect(documentDisplayName(path)).toBe("guide with spaces.md");
    expect(path).toBe("docs/guide%20with%20spaces.md");
    expect(documentDisplayName("C:\\docs\\%C3%B6zet.md")).toBe("özet.md");
    expect(documentDisplayName("docs/literal%2520name.md")).toBe("literal%20name.md");
  });

  it("keeps malformed percent encoding readable without throwing", () => {
    expect(documentDisplayName("docs/guide%ZZ.md")).toBe("guide%ZZ.md");
    expect(documentDisplayName("docs/guide%E0%A4.md")).toBe("guide%E0%A4.md");
    expect(documentDisplayName("docs/100%.md")).toBe("100%.md");
  });
});
