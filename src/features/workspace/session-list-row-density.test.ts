import { describe, expect, it } from "vitest";
import { sessionRowLayout } from "./session-list-row-density";

describe("session row density", () => {
  it("keeps compact to one 48dp line without meta", () => {
    expect(sessionRowLayout("compact", false)).toMatchObject({
      minHeight: 48, providerIconSize: 16, titleLines: 1, stampInline: true,
      meta: false, model: false, workItem: false, managed: false, snooze: false,
    });
  });

  it("keeps the work item and managed mark in standard, leaving the model to detailed", () => {
    expect(sessionRowLayout("standard", false)).toMatchObject({
      minHeight: 56, titleLines: 2, meta: true, wrapMeta: false, model: false, workItem: true, managed: true,
    });
  });

  it("adds model and wrapping meta in detailed", () => {
    expect(sessionRowLayout("detailed", false)).toMatchObject({
      meta: true, wrapMeta: true, model: true, workItem: true, managed: true, snooze: true,
    });
  });

  it("wraps every density at large text", () => {
    for (const density of ["compact", "standard", "detailed"] as const) {
      const layout = sessionRowLayout(density, true);
      expect(layout.titleLines).toBeUndefined();
      expect(layout.stampInline).toBe(false);
      expect(layout.wrapMeta || !layout.meta).toBe(true);
    }
  });
});
