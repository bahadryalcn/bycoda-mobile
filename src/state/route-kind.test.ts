import { describe, expect, it } from "vitest";
import { routeKind, routeLabel } from "./route-kind";

const key = "ab".repeat(32);
const copy = (_tr: string, en: string) => en;

describe("route kind", () => {
  it("classifies local network, tailnet and public routes", () => {
    expect(routeKind({ endpoint: "http://192.168.1.2:3777", lanKey: key })).toBe("lan");
    expect(routeKind({ endpoint: "http://100.101.102.103:42000", lanKey: key })).toBe("tailscale");
    expect(routeKind({ endpoint: "https://bab.tail12e784.ts.net" })).toBe("tailscale");
    expect(routeKind({ endpoint: "https://phones.example.com", public: true })).toBe("public");
    expect(routeKind({ endpoint: "https://proxy.example.com" })).toBeNull();
  });
  it("labels each kind", () => {
    expect(routeLabel("lan", copy)).toBe("Local network");
    expect(routeLabel("tailscale", copy)).toBe("Tailscale (private)");
    expect(routeLabel("public", copy)).toBe("Public internet");
  });
});
