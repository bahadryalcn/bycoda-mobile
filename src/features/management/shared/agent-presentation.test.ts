import { expect, it } from "vitest";
import { agentPresentation } from "./agent-presentation";

it("uses canonical provider names and omits only the matching routing prefix from displayed models", () => {
  expect(agentPresentation("codex", "codex:gpt-6.1-sol")).toBe("Codex · gpt-6.1-sol");
  expect(agentPresentation("claude", "claude:claude-opus-4-7")).toBe("Claude · claude-opus-4-7");
  expect(agentPresentation("opencode", "vendor:custom-model")).toBe("OpenCode · vendor:custom-model");
  expect(agentPresentation("custom-provider", "custom-provider:model-one")).toBe("custom-provider · model-one");
  expect(agentPresentation("codex", "")).toBe("Codex");
});
