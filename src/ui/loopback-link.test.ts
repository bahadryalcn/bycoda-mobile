import { describe, expect, it } from "vitest";
import { isLoopbackWebUrl, loopbackScopeKey } from "./loopback-link";

describe("isLoopbackWebUrl", () => {
  it("recognizes loopback web addresses, keeping path, query and hash out of the decision", () => {
    expect(isLoopbackWebUrl("http://localhost:3000/app?tab=1#top")).toBe(true);
    expect(isLoopbackWebUrl("https://LOCALHOST/")).toBe(true);
    expect(isLoopbackWebUrl("http://localhost.:3000/app")).toBe(true);
    expect(isLoopbackWebUrl("http://app.localhost:8080/")).toBe(true);
    expect(isLoopbackWebUrl("http://127.0.0.1:5173/")).toBe(true);
    expect(isLoopbackWebUrl("http://127.12.0.9/")).toBe(true);
    expect(isLoopbackWebUrl("http://[::1]:4000/")).toBe(true);
    expect(isLoopbackWebUrl("http://0.0.0.0:3000/")).toBe(true);
    expect(isLoopbackWebUrl("http://[::]:3000/")).toBe(true);
    expect(isLoopbackWebUrl("http://[::ffff:127.0.0.1]:3000/")).toBe(true);
  });

  it("leaves public and non-web addresses to the external browser", () => {
    expect(isLoopbackWebUrl("https://example.com/localhost")).toBe(false);
    expect(isLoopbackWebUrl("http://192.168.1.20:3000/")).toBe(false);
    expect(isLoopbackWebUrl("http://localhost.example.com/")).toBe(false);
    expect(isLoopbackWebUrl("file:///localhost/index.html")).toBe(false);
    expect(isLoopbackWebUrl("not a url")).toBe(false);
  });
});

describe("loopbackScopeKey", () => {
  it("separates sessions, projects and machines", () => {
    const base = { machineId: "m1", projectId: "p1", sessionId: "s1" };
    expect(loopbackScopeKey(base)).toBe(loopbackScopeKey({ ...base }));
    expect(loopbackScopeKey(base)).not.toBe(loopbackScopeKey({ ...base, sessionId: "s2" }));
    expect(loopbackScopeKey(base)).not.toBe(loopbackScopeKey({ ...base, projectId: "p2" }));
    expect(loopbackScopeKey(base)).not.toBe(loopbackScopeKey({ ...base, machineId: "m2" }));
    expect(loopbackScopeKey({ machineId: "m1", projectId: "p1" })).not.toBe(loopbackScopeKey(base));
  });
});
