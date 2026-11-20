import { describe, expect, it } from "vitest";
import {
  activeSessionFilterCount,
  defaultSessionListFilters,
  matchesSessionListFilters,
  sessionProviders,
  sessionTimeStart,
  type SessionListFilters,
} from "./session-filters";

const day = 24 * 60 * 60 * 1000;
const now = new Date(2026, 10, 14, 15, 30).getTime();
const session = (extra: Partial<Parameters<typeof matchesSessionListFilters>[0]> = {}) =>
  ({ harness: "claude", updatedAt: now, ...extra }) as Parameters<typeof matchesSessionListFilters>[0];
const filters = (extra: Partial<SessionListFilters>): SessionListFilters => ({ ...defaultSessionListFilters, ...extra });

describe("session list filters", () => {
  it("passes every session with the defaults", () => {
    expect(matchesSessionListFilters(session({ harness: "codex", updatedAt: 0 }), defaultSessionListFilters, now)).toBe(true);
    expect(activeSessionFilterCount(defaultSessionListFilters)).toBe(0);
  });

  it("distinguishes the recent view from explicitly requesting all time", () => {
    expect(defaultSessionListFilters.time).toBe("recent");
    expect(activeSessionFilterCount(filters({ time: "all" }))).toBe(1);
    expect(matchesSessionListFilters(session({ updatedAt: now - 50 * day }), filters({ time: "all" }), now)).toBe(true);
  });

  it("hides turned-off providers and keeps the rest", () => {
    const hidden = filters({ hiddenProviders: ["codex"] });
    expect(matchesSessionListFilters(session({ harness: "codex" }), hidden, now)).toBe(false);
    expect(matchesSessionListFilters(session({ harness: "claude" }), hidden, now)).toBe(true);
  });

  it("reads management only from the Host stamp", () => {
    const managed = filters({ managed: true });
    expect(matchesSessionListFilters(session(), managed, now)).toBe(false);
    expect(matchesSessionListFilters(session({ managedBy: { assistant: true, managedAt: 1, jobId: "j" } }), managed, now)).toBe(true);
  });

  it("uses last activity before the update time, like desktop", () => {
    const week = filters({ time: "7d" });
    expect(matchesSessionListFilters(session({ updatedAt: now - 10 * day }), week, now)).toBe(false);
    expect(matchesSessionListFilters(session({ updatedAt: now - 10 * day, lastActivityAt: now - day }), week, now)).toBe(true);
    expect(matchesSessionListFilters(session({ updatedAt: now, lastActivityAt: now - 40 * day }), filters({ time: "30d" }), now)).toBe(false);
  });

  it("starts Today at local midnight", () => {
    const midnight = new Date(2026, 10, 14).getTime();
    expect(sessionTimeStart("today", now)).toBe(midnight);
    expect(matchesSessionListFilters(session({ updatedAt: midnight - 1 }), filters({ time: "today" }), now)).toBe(false);
    expect(sessionTimeStart("all", now)).toBe(0);
  });

  it("lists present providers once in first-seen order and counts active filters", () => {
    expect(sessionProviders([{ harness: "codex" }, { harness: "claude" }, { harness: "codex" }])).toEqual(["codex", "claude"]);
    expect(activeSessionFilterCount(filters({ hiddenProviders: ["a", "b"], managed: true, time: "today" }))).toBe(3);
  });
});
