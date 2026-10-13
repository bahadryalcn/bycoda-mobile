import { expect, it, vi } from "vitest";
import { bundleHtmlResources } from "./html-resources";
import type { MessageContext } from "./media-policy";
it("inlines authorized project resources while retaining no host URL or credentials", async () => {
  const request = vi.fn().mockImplementation((_method, params) => params.command === "read_binary_file" ? "AA==" : "body{color:red}");
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  const result = await bundleHtmlResources('<img src="../assets/a.png"><link rel="stylesheet" href="main.css"><img src="https://localhost/secret"><img src="../../secret.png">', "docs/page.html", context);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map((call) => call[1].args.path)).toEqual(["/project/assets/a.png", "/project/docs/main.css"]);
  expect(result.html).toContain('src="data:image/png;base64,AA=="'); expect(result.html).toContain("<style>body{color:red}</style>"); expect(result.unavailable).toBe(2);
});
