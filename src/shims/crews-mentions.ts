/**
 * Metro-only stand-in for the desktop `crews/public/mentions` barrel. The desktop barrel also
 * re-exports avatar components built on web-only motion libraries, which the native bundle cannot
 * resolve; shared chat models only need these model exports. See `metro.config.cjs`.
 */
export { HOST_CREWS } from "../../../src/features/crews/model/crew";
export type { CrewDefinition, CrewRole, SavedCrewAgent } from "../../../src/features/crews/model/crew";
export { CREW_HANDLE_PATTERN } from "../../../src/features/crews/model/crewIdentity";
export { memberTraits } from "../../../src/features/crews/model/memberAvatars";
