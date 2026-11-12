import { crewPaletteColor, parseHandle, type CrewAppearance } from "../../../../../src/features/crews/model/crewIdentity";
import { memberLink, type MemberLink } from "../../../../../src/features/crews/model/crewLink";
import { memberTraits, teamTraits } from "../../../../../src/features/crews/model/memberAvatars";
import {
  AVATAR_ACCESSORY,
  AVATAR_FACE,
  AVATAR_HEADWEAR,
  AVATAR_OUTFIT,
  AVATAR_PALETTE_COUNT,
  memberAvatarSeed,
  seededAvatarTraits,
  type MemberAvatarChoice,
  type MemberAvatarTraits,
} from "../../../../../src/features/crews/model/memberAvatarTraits";
import type { ActiveCrewMember, CrewAgent, SavedCrewAgent } from "@/remote/contracts/crews";

export { memberTraits, teamTraits };
export type { MemberLink };

/** Host capability: members carry `avatar`/`handle`, crews carry `appearance`. */
export const CREW_IDENTITY_CAPABILITY = "crews.identity.v1";
/** Host capability: `crews.active.list` reports members currently working. */
export const CREW_ACTIVE_CAPABILITY = "crews.active.v1";

type Identified = Pick<CrewAgent, "id" | "avatar"> & { source?: { id: string } };

export const handleLabel = (handle: string | undefined) => (handle ? `@${handle}` : undefined);

/** Looks for a roster, so members without saved choices never look alike (as on desktop). */
export function rosterTraits(agents: readonly Identified[]): Map<string, MemberAvatarTraits> {
  return teamTraits(agents);
}

/** Library/Customized state of a crew member; undefined for crew-only members. */
export function linkState(member: CrewAgent, library: readonly SavedCrewAgent[]): MemberLink | undefined {
  return memberLink(member, library)?.state;
}

/** Empty input clears the handle; anything else is lowercased for the Host's pattern. */
export function handleFromInput(text: string): string | undefined {
  const value = text.trim().toLowerCase();
  return value || undefined;
}

export function handleError(handle: string | undefined): boolean {
  if (!handle) return false;
  try {
    parseHandle(handle);
    return false;
  } catch {
    return true;
  }
}

/** A saved choice that keeps every other part as currently shown. */
export function withLookPart(member: Identified, patch: MemberAvatarChoice): MemberAvatarChoice {
  return { ...memberTraits(member), ...patch };
}

/** A different seeded look; `salt` is any positive integer and stays deterministic. */
export function shuffledLook(member: Identified, salt: number): MemberAvatarChoice {
  return seededAvatarTraits(memberAvatarSeed(member), Math.max(1, Math.floor(salt)));
}

type LookPart = "headwear" | "face" | "outfit" | "accessory";
export const LOOK_PARTS: Record<LookPart, readonly string[]> = {
  headwear: AVATAR_HEADWEAR,
  face: AVATAR_FACE,
  outfit: AVATAR_OUTFIT,
  accessory: AVATAR_ACCESSORY,
};
export const LOOK_PALETTES: readonly number[] = Array.from({ length: AVATAR_PALETTE_COUNT }, (_, index) => index);

/** The crew's accent color from its Host-stored look; undefined keeps the default. */
export function crewAccent(appearance: CrewAppearance | undefined): string | undefined {
  return crewPaletteColor(appearance?.color);
}

const ATTENTION_RANK = ["decision", "review", "blocked"] as const;

/** Members needing the owner first, then the longest running. */
export function sortActive(items: readonly ActiveCrewMember[]): ActiveCrewMember[] {
  const rank = (item: ActiveCrewMember) =>
    item.attention ? ATTENTION_RANK.indexOf(item.attention) : ATTENTION_RANK.length;
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.startedAt ?? Number.POSITIVE_INFINITY) - (b.startedAt ?? Number.POSITIVE_INFINITY) ||
      a.memberName.localeCompare(b.memberName),
  );
}

/** What the member is on: its task, else the run, else the crew. */
export const activeFocus = (item: ActiveCrewMember) =>
  item.taskTitle?.trim() || item.runTitle?.trim() || item.definitionName;

export const activeKey = (item: ActiveCrewMember) =>
  [item.runId, item.memberId, item.taskId ?? "", item.kind].join(":");

/** Polls fast while anyone works, slowly otherwise. */
export const activePollInterval = (items: readonly unknown[] | undefined) => (items?.length ? 2000 : 10_000);
