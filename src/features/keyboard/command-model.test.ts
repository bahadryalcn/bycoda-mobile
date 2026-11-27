import { describe, expect, it } from "vitest";
import { appCommands, findCommand } from "./command-model";

const copy = (_tr: string, en: string) => en;

describe("appCommands", () => {
  it("lists unique ids with the palette destinations", () => {
    const commands = appCommands(copy);
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    expect(findCommand(commands, "new")?.destination).toEqual({ pathname: "/session/[id]", params: { id: "new" } });
    expect(findCommand(commands, "tool:terminals")?.destination).toEqual({ pathname: "/tools/[tool]", params: { tool: "terminals" } });
    expect(commands.map((c) => c.id)).toEqual(expect.arrayContaining(["computers", "settings", "account", "tools", "tool:devices"]));
  });
  it("localizes labels through the supplied copy", () => {
    expect(findCommand(appCommands((tr) => tr), "settings")?.label).toBe("Ayarlar");
    expect(findCommand(appCommands(copy), "missing")).toBeUndefined();
  });
});
