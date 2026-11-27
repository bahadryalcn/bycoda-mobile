import { agentPresentation } from "../shared/agent-presentation";
import type { CrewCandidate, CrewDefinition } from "@/remote/contracts/crews";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, QueryState, Stack } from "@/ui/primitives";

type Inspection = { candidates?: Array<CrewCandidate & { imageGeneration?: { state?: string }; observations?: unknown }> };
type Copy = ReturnType<typeof useCopy>;

/** Owner-facing names for the Host's crew capabilities; an unknown name is not shown raw. */
function capabilityLabel(name: string, copy: Copy): string | undefined {
  switch (name) {
    case "code": return copy("Kod yazma", "Code");
    case "review": return copy("İnceleme", "Review");
    case "image-generation": return copy("Görüntü oluşturma", "Image generation");
    case "vision": return copy("Görsel anlama", "Vision");
    case "browser": return copy("Tarayıcı", "Browser");
    case "terminal": return copy("Terminal", "Terminal");
    case "subagents": return copy("Alt ajanlar", "Subagents");
    default: return undefined;
  }
}

function evidenceLabel(state: string | undefined, copy: Copy): string {
  return state === "available"
    ? copy("Kullanılabilir", "Available")
    : state === "unavailable"
      ? copy("Kullanılamaz", "Unavailable")
      : copy("Bilinmiyor", "Unknown");
}

/** Reads host evidence for the saved definition; opening this view never starts a run. */
export function CrewMemberInspection({ definition, memberId, projectId }: { definition: CrewDefinition; memberId: string; projectId: string }) {
  const copy = useCopy();
  const query = useHostQuery<Inspection>(["crews", projectId, "inspection", definition.id, memberId], "crews.inspect",
    { projectId, definitionId: definition.id, memberId });
  return <Stack>
    <QueryState query={query} />
    {query.data?.candidates?.map((candidate) => <Stack key={candidate.id}>
      <Body>{agentPresentation(candidate.harness, candidate.model)}</Body>
      {Object.entries(candidate.capabilities).map(([name, evidence]) => {
        const label = capabilityLabel(name, copy);
        return label ? <Body key={name} muted>{label}: {evidenceLabel(evidence?.state, copy)}</Body> : null;
      })}
      {candidate.imageGeneration?.state && <Body muted>{copy("Görüntü oluşturma", "Image generation")}: {evidenceLabel(candidate.imageGeneration.state, copy)}</Body>}
    </Stack>)}
  </Stack>;
}
