import { ProviderAccountKind } from "@/ui/provider-account-kind";
import { useModelCatalog } from "@/state/model-catalog";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import type { HostSession } from "./wire";
import { providerChoices, selectedChoice } from "./provider-choices";

/** Provider glyph with the account colour, shown before the model name in the composer chip. */
export function ComposerModelMark({ session }: { session: HostSession }) {
  const { harness, providerAccountId } = session.session;
  // Shares the cache of the settings sheet; the colour is optional while the catalog loads.
  const catalog = useModelCatalog(session.projectId);
  const choice = selectedChoice(
    providerChoices([harness], catalog.data?.accounts, ""),
    harness,
    providerAccountId,
  );
  return (
    <>
      <ProviderAccountMark provider={harness} color={choice?.color} size={16} />
      <ProviderAccountKind kind={choice?.kind} derivedKind={choice?.derivedKind} />
    </>
  );
}
