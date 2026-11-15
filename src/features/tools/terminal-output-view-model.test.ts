import { expect, it } from "vitest";
import { filterTerminalOutput } from "./terminal-output-view-model";

it("searches literal lines without changing shell output or treating patterns as commands", () => {
  const output = "Build started\nERROR [compile]: unexpected token\noutput.* finished\n";
  expect(filterTerminalOutput(output, " error ")).toEqual({ text: "ERROR [compile]: unexpected token", matches: 1 });
  expect(filterTerminalOutput(output, ".*")).toEqual({ text: "output.* finished", matches: 1 });
  expect(filterTerminalOutput(output, " ")).toEqual({ text: output, matches: 0 });
});
it("keeps complete long paths and repeated matches, with an explicit no-results value", () => {
  const path = "G:/Projects/my_projects/customer-platform/frontend-internationalization/packages/account-management/src/security.ts";
  expect(filterTerminalOutput(`${path}\n${path}\nReady`, "security.ts")).toEqual({ text: `${path}\n${path}`, matches: 2 });
  expect(filterTerminalOutput("", "missing")).toEqual({ text: "", matches: 0 });
});
