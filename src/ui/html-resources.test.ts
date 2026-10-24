import { expect, it, vi } from "vitest";
import { bundleHtmlResources } from "./html-resources";
import type { MessageContext } from "./media-policy";
it("rejects an already cancelled preview even when every resource is inline", async () => {
  const controller = new AbortController();
  controller.abort();
  const request = vi.fn();
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  await expect(
    bundleHtmlResources(
      '<img src="data:image/png;base64,AA==">',
      "index.html",
      context,
      controller.signal,
    ),
  ).rejects.toThrow("cancelled");
  expect(request).not.toHaveBeenCalled();
});
it("holds source-ordered lookahead to three results and never starts queued reads after the budget fills", async () => {
  const html = Array.from({ length: 12 }, (_, index) => `<script src="${index}.js"></script>`).join(
    "",
  );
  const firstValue = "A".repeat(2 * 1024 * 1024 - html.length);
  let releaseFirst!: () => void;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const request = vi.fn(async (_method, params) => {
    if (params.args.path === "/project/0.js") {
      await first;
      return firstValue;
    }
    return "later();";
  });
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  const work = bundleHtmlResources(html, "index.html", context);
  try {
    // Later responses settle while the first source-order consumer remains blocked.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    releaseFirst();
  }
  const result = await work;
  expect(request).toHaveBeenCalledTimes(3);
  expect(result.unavailable).toBe(11);
  expect(result.html).toBe(
    `<script>${firstValue}</script>` + html.slice('<script src="0.js"></script>'.length),
  );
});
it("coalesces repeated paths, bounds concurrent reads, and preserves script order", async () => {
  let active = 0;
  let maximum = 0;
  const request = vi.fn(async (_method, params) => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, params.args.path.endsWith("a.js") ? 15 : 1));
    active--;
    return params.args.path.endsWith("a.js") ? "first();" : "second();";
  });
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  const html =
    '<script src="a.js"></script><script src="b.js"></script><script src="a.js"></script>';
  const result = await bundleHtmlResources(html, "index.html", context);
  expect(request).toHaveBeenCalledTimes(2);
  expect(maximum).toBe(2);
  expect(result.html).toBe(
    "<script>first();</script><script>second();</script><script>first();</script>",
  );
});
it("does not begin more than three reads and cancels queued resources", async () => {
  const controller = new AbortController();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const request = vi.fn(async () => {
    await gate;
    return "content";
  });
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  const work = bundleHtmlResources(
    Array.from({ length: 12 }, (_, i) => `<script src="${i}.js"></script>`).join(""),
    "index.html",
    context,
    controller.signal,
  );
  expect(request).toHaveBeenCalledTimes(3);
  const rejection = expect(work).rejects.toThrow("cancelled");
  controller.abort();
  finish();
  await rejection;
  expect(request).toHaveBeenCalledTimes(3);
});
it.each(["A".repeat(2 * 1024 * 1024), "!".repeat(1024)])(
  "does not charge rejected resources against later valid images (%#)",
  async (rejected) => {
    const request = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce("AA==");
    const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
    const result = await bundleHtmlResources(
      '<img src="large.png"><img src="small.png">',
      "index.html",
      context,
    );
    expect(result.unavailable).toBe(1);
    expect(result.html).toContain('src="data:image/png;base64,AA=="');
  },
);
it("inlines authorized project resources while retaining no host URL or credentials", async () => {
  const request = vi
    .fn()
    .mockImplementation((_method, params) =>
      params.command === "read_binary_file" ? "AA==" : "body{color:red}",
    );
  const context = { cwd: "/project", client: { request } } as unknown as MessageContext;
  const result = await bundleHtmlResources(
    '<img src="../assets/a.png"><link rel="stylesheet" href="main.css"><img src="https://localhost/secret"><img src="../../secret.png">',
    "docs/page.html",
    context,
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map((call) => call[1].args.path)).toEqual([
    "/project/assets/a.png",
    "/project/docs/main.css",
  ]);
  expect(result.html).toContain('src="data:image/png;base64,AA=="');
  expect(result.html).toContain("<style>body{color:red}</style>");
  expect(result.unavailable).toBe(2);
});
