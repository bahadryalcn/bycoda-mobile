import { expect, it } from "vitest";
import type { ActiveCrewMember, CrewAgent } from "@/remote/contracts/crews";
import { memberAvatarRects } from "../../../../../src/features/crews/model/memberAvatarArt";
import {
  activeFocus, crewAccent, handleError, handleFromInput, handleLabel, linkState, memberTraits, rosterTraits, shuffledLook, sortActive, withLookPart,
} from "./identity-model";

const member = (id: string, extra: Partial<CrewAgent> = {}): CrewAgent =>
  ({ id, role: "specialist", name: id, instructions: "", selection: "fixed", candidates: [], ...extra });

it("draws the same traits to the same rects and keeps saved choices", () => {
  const a = member("a", { avatar: { headwear: "beret", palette: 2 } });
  expect(memberTraits(a)).toMatchObject({ headwear: "beret", palette: 2 });
  expect(memberAvatarRects(memberTraits(a)).length).toBeGreaterThan(10);
  expect(rosterTraits([a, member("b")]).get("a")).toEqual(memberTraits(a));
});

it("normalizes and validates handles", () => {
  expect(handleFromInput("  Ada-1 ")).toBe("ada-1");
  expect(handleFromInput(" ")).toBeUndefined();
  expect(handleError("ada-1")).toBe(false);
  expect(handleError("-bad")).toBe(true);
  expect(handleError(undefined)).toBe(false);
  expect(handleLabel("ada")).toBe("@ada");
});

it("patches one look part and shuffles deterministically", () => {
  const a = member("a");
  expect(withLookPart(a, { glasses: true })).toEqual({ ...memberTraits(a), glasses: true });
  expect(shuffledLook(a, 3)).toEqual(shuffledLook(a, 3));
  expect(shuffledLook(a, 0)).toEqual(shuffledLook(a, 1));
});

it("reports the library link only for members with a visible profile", () => {
  const profile = { ...member("lib"), updatedAt: 1 };
  expect(linkState(member("m", { source: { id: "lib", updatedAt: 1 } }), [profile])).toBe("linked");
  expect(linkState(member("m", { source: { id: "lib", updatedAt: 1 }, customized: true }), [profile])).toBe("customized");
  expect(linkState(member("m"), [profile])).toBeUndefined();
});

it("maps the crew look to a palette color", () => {
  expect(crewAccent(undefined)).toBeUndefined();
  expect(crewAccent({ color: 0 })).toBeUndefined();
  expect(crewAccent({ color: 1 })).toMatch(/^#|^hsl/);
});

it("orders active members by attention then start and names their focus", () => {
  const row = (memberName: string, extra: Partial<ActiveCrewMember>): ActiveCrewMember => ({
    runId: "r", projectId: "p", definitionId: "d", definitionName: "Crew", runStatus: "active",
    memberId: memberName, memberName, memberRole: "specialist", kind: "worker", ...extra,
  });
  const sorted = sortActive([row("late", { startedAt: 9 }), row("early", { startedAt: 1 }), row("ask", { attention: "decision", startedAt: 5 })]);
  expect(sorted.map((item) => item.memberName)).toEqual(["ask", "early", "late"]);
  expect(activeFocus(row("x", { taskTitle: " Fix ", runTitle: "Run" }))).toBe("Fix");
  expect(activeFocus(row("x", {}))).toBe("Crew");
});
