import { expect, it } from "vitest";
import { sessionTitleUpdate } from "./session-title-update";

it.each(["", "  ", "\n\t"])("rejects blank title %j", title => {
  expect(() => sessionTitleUpdate("p", "s", title, {})).toThrow("required");
});
it("trims title and preserves displayed authority including legacy absence", () => {
  expect(sessionTitleUpdate("p", "s", "  Name  ", { authorityGeneration: 3 })).toEqual({ projectId: "p", sessionId: "s", title: "Name", authorityGeneration: 3 });
  expect(sessionTitleUpdate("p", "s", "Name", {})).toHaveProperty("authorityGeneration", undefined);
  expect(() => sessionTitleUpdate("p", "s", "Name", { authorityGeneration: 0 })).toThrow("authority");
});
