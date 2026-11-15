import { agentPresentation } from "../shared/agent-presentation";
import type { CrewCandidate, CrewDefinition } from "@/remote/contracts/crews";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, QueryState, Stack } from "@/ui/primitives";

type Inspection = { candidates?: Array<CrewCandidate & { imageGeneration?: { state?: string }; observations?: unknown }> };

/** Reads host evidence for the saved definition; opening this view never starts a run. */
export function CrewMemberInspection({ definition, memberId, projectId }: { definition: CrewDefinition; memberId: string; projectId: string }) {
  const copy = useCopy();
  const query = useHostQuery<Inspection>(["crews", projectId, "inspection", definition.id, memberId], "crews.inspect",
    { projectId, definitionId: definition.id, memberId });
  return <Stack>
    <QueryState query={query} />
    {query.data?.candidates?.map((candidate) => <Stack key={candidate.id}>
      <Body>{agentPresentation(candidate.harness, candidate.model)}</Body>
      {Object.entries(candidate.capabilities).map(([name, evidence]) => <Body key={name} muted>{name}: {evidence?.state ?? copy("Bilinmiyor", "Unknown")}</Body>)}
      {candidate.imageGeneration?.state && <Body muted>{copy("Görüntü oluşturma", "Image generation")}: {candidate.imageGeneration.state}</Body>}
    </Stack>)}
  </Stack>;
}
