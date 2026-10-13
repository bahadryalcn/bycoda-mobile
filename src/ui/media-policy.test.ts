import { describe, expect, it } from "vitest";
import { externalImageUrl, previewNavigationAllowed, resolveMediaPath, resolveProjectPath, sandboxPreviewHtml, mediaQueryKey, type MessageContext } from "./media-policy";
describe("native media boundary", () => {
  it("resolves relative and line-qualified paths without leaving the selected root", () => {
    expect(resolveProjectPath("G:/project", "src/app.ts:42:8")).toBe("G:/project/src/app.ts");
    expect(resolveProjectPath("G:/project", "g:/PROJECT/src/app.ts#L42")).toBe("G:/project/src/app.ts");
    for (const path of ["../secret", "%2e%2e/secret", "G:/project-other/secret", "file:///C:/secret", "https://example.com/a", "a/../../secret"]) expect(resolveProjectPath("G:/project", path), path).toBeNull();
    const context = { cwd: "/project", basePath: "docs/readme.md" } as MessageContext;
    expect(resolveMediaPath(context, "../assets/image.png")).toBe("/project/assets/image.png");
    expect(resolveMediaPath(context, "../../secret")).toBeNull();
  });
  it("denies local/credentialed network media and all privileged preview navigation", () => {
    for (const source of ["http://example.com/a", "https://127.0.0.1/a", "https://10.0.2.2/a", "https://[::1]/a", "https://pc.local/a", "https://u:p@example.com/a", "file:///secret", "data:image/png;base64,AA=="]) expect(externalImageUrl(source), source).toBeNull();
    expect(externalImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(previewNavigationAllowed("about:blank")).toBe(true);
    for (const url of ["https://example.com", "file:///tmp/a", "content://media/a", "bycoda://send", "http://10.0.2.2"]) expect(previewNavigationAllowed(url)).toBe(false);
    const html = sandboxPreviewHtml('<meta http-equiv="refresh" content="0;url=https://example.com"><script>fetch("/")</script>');
    expect(html).toContain("connect-src 'none'"); expect(html).toContain("form-action 'none'"); expect(html).not.toContain('http-equiv="refresh"');
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("fetch("));
  });
  it("keeps all media cache entries under the existing machine privacy boundary", () => {
    const context = { machineId: "machine-a", projectId: "p", sessionId: "s", cwd: "/project", client: { machine: { endpoint: "https://pc", environmentId: "env" } } } as MessageContext;
    const key = mediaQueryKey(context, ["image", "a"]);
    expect(key.slice(0, 2)).toEqual(["machine", "machine-a"]);
    expect(key).toContain("p"); expect(key).toContain("s"); expect(key).toContain("env");
  });
});
