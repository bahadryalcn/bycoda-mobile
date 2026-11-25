import { expect, it } from "vitest";
import { redirectSystemPath } from "../../app/+native-intent";

it.each([
  ["bycoda://settings", "/settings"],
  ["bycoda:///sessions", "/sessions"],
  ["bycoda://tools/providers", "/tools/providers"],
  ["bycoda://project/p%2F1?machineId=local%20host", "/project/p%2F1?machineId=local%20host"],
  ["bycoda://project/%E0%A4%A", "/+not-found"],
])("routes %s as a local path", (path, target) => {
  expect(redirectSystemPath({ path, initial: true })).toBe(target);
  expect(redirectSystemPath({ path, initial: false })).toBe(target);
});

it("preserves native callbacks, session references and repeat prompt links", () => {
  expect(redirectSystemPath({ path: "bycoda://sso-callback?code=x", initial: false })).toBeNull();
  expect(redirectSystemPath({ path: "bycoda://dataUrl=bycodaShareKey", initial: true })).toBe("/");
  expect(redirectSystemPath({ path: "bycoda://session/v1/host/m/s", initial: false }))
    .toBe("/session-reference?link=bycoda%3A%2F%2Fsession%2Fv1%2Fhost%2Fm%2Fs");
  const prompt = () => redirectSystemPath({ path: "bycoda://new/v1?prompt=Example", initial: false });
  expect(prompt()).toMatch(/^\/sessions\?new=1&prompt=Example&n=link/);
  expect(prompt()).not.toBe(prompt());
});
