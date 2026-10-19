import { expect, it, vi } from "vitest";
import { boundedResponseText } from "./response-body";
it("counts UTF-8 bytes while retaining split code points", async () => {
  const value = String.fromCodePoint(233, 128512);
  const bytes = new TextEncoder().encode(value);
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 3)); controller.enqueue(bytes.slice(3)); controller.close();
  } }));
  await expect(boundedResponseText(response, 6, () => new Error("large"))).resolves.toBe(value);
});
it("rejects the first overflowing chunk without consuming more or buffering text()", async () => {
  let pulled = 0;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ pull(controller) {
    pulled++; controller.enqueue(new Uint8Array(4));
  }, cancel }, { highWaterMark: 0 }));
  const text = vi.spyOn(response, "text");
  await expect(boundedResponseText(response, 7, () => new Error("large"))).rejects.toThrow("large");
  expect(pulled).toBe(2); expect(cancel).toHaveBeenCalledOnce(); expect(text).not.toHaveBeenCalled();
});
it("rejects unsupported non-streaming bodies before an unbounded read", async () => {
  const text = vi.fn();
  await expect(boundedResponseText({ headers: new Headers(), text } as unknown as Response, 7, () => new Error("large"))).rejects.toThrow("Streaming");
  expect(text).not.toHaveBeenCalled();
});
