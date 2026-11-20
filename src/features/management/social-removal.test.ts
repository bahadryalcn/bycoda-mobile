import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { isManagementSection, managementSections } from "./sections";
import { readonlyRequest } from "@/remote/request-policy";

// Social media management is a desktop feature: the phone only follows the computer (#1463).
const srcRoot = join(__dirname, "..", "..");
const appRoot = join(srcRoot, "..", "app");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
const text = (path: string) => readFileSync(path, "utf8");
const at = (...parts: string[]) => join(srcRoot, ...parts);

it("has no Social section, route or directory entry", () => {
  expect(Object.keys(managementSections)).not.toContain("social");
  expect(isManagementSection("social")).toBe(false);
});

it("keeps the removed Social management modules deleted", () => {
  for (const path of [
    at("features", "management", "social-screen.tsx"),
    at("features", "management", "social-editors.tsx"),
    at("features", "management", "social-flow.ts"),
    at("features", "management", "social", "accounts-panel.tsx"),
    at("features", "management", "social", "threads-panel.tsx"),
    at("features", "management", "social", "drafts-panel.tsx"),
    at("features", "management", "social", "use-workspace-query.ts"),
    at("features", "management", "social", "policy-settings.tsx"),
    at("features", "management", "social", "account-card.tsx"),
    at("features", "management", "social", "oauth-polling.ts"),
    at("features", "management", "social", "policy.tsx"),
    at("features", "management", "social-content.ts"),
    at("remote", "contracts", "social.ts"),
    at("remote", "services", "social-api.ts"),
  ])
    expect(existsSync(path), relative(srcRoot, path)).toBe(false);
});

it("exposes no Social client or request policy in the shared Host layer", () => {
  for (const file of [at("api", "hostClient.ts"), at("remote", "api.ts"), at("remote", "request-policy.ts")])
    expect(text(file), relative(srcRoot, file)).not.toMatch(/social/i);
  for (const method of ["social.request", "social.oauth.status", "social.browser.status"])
    expect(readonlyRequest(method, { action: "snapshot" })).toBe(false);
});

it("never targets Social from push notifications, widgets or deep links", () => {
  const surfaces = [at("features", "push"), at("features", "widgets"), appRoot].flatMap(sources);
  expect(surfaces.length).toBeGreaterThan(0);
  expect(surfaces.filter((file) => /social/i.test(text(file))).map((file) => relative(srcRoot, file))).toEqual([]);
});

it("filters Host Social attention items only through the shared inbox helper", () => {
  const filters = sources(srcRoot)
    .filter((file) => /\bkind\s*[!=]==?\s*["']social["']/.test(text(file)))
    .map((file) => relative(srcRoot, file).replaceAll("\\", "/"));
  expect(filters).toEqual(["features/inbox/attention-groups.ts"]);
});

it("keeps Social-only wording out of every locale catalog", () => {
  const removed = [
    "Social media",
    "Social policy",
    "Save social policy",
    "Global social policy",
    "Stop all social work",
    "No social accounts on this computer",
    "Update bycoda on the computer to view social history.",
    "Approvals, questions, work and social conversations on the connected computer.",
  ];
  const locales = readdirSync(at("locales")).filter((name) => name.endsWith(".json"));
  expect(locales).toHaveLength(8);
  for (const name of locales) {
    const catalog = JSON.parse(text(at("locales", name))) as Record<string, string>;
    expect(removed.filter((key) => key in catalog), name).toEqual([]);
  }
});
