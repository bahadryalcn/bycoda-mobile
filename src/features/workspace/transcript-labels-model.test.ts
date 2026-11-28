import { expect, it } from "vitest";
import type { Block } from "./wire";
import { isPastedTextAttachment, pendingImageGeneration } from "./transcript-labels-model";

it("recognises only the desktop's pasted-text attachment", () => {
  expect(isPastedTextAttachment({ name: "Pasted text.txt", mimeType: "text/plain" })).toBe(true);
  expect(isPastedTextAttachment({ name: "Pasted text.txt", mimeType: "application/pdf" })).toBe(false);
  expect(isPastedTextAttachment({ name: "notes.txt", mimeType: "text/plain" })).toBe(false);
});

it("reads an image generation without an image by its state", () => {
  const block = (status: "running" | "completed" | "failed" | "stopped", image?: Block["image"]) =>
    ({ role: "image", imageGeneration: { itemId: "i", status }, image }) as Pick<Block, "role" | "image" | "imageGeneration">;
  expect(pendingImageGeneration(block("running"))).toBe("running");
  expect(pendingImageGeneration(block("failed"))).toBe("failed");
  expect(pendingImageGeneration(block("stopped"))).toBe("stopped");
  expect(pendingImageGeneration(block("completed"))).toBeUndefined();
  expect(pendingImageGeneration(block("running", { name: "a.png", path: "/a.png" } as Block["image"]))).toBeUndefined();
  expect(pendingImageGeneration({ role: "tool" })).toBeUndefined();
});
