import { MutationState, Notice } from "@/ui/primitives";
import type { MutationStateProps } from "@/ui/component-props";
import { useCopy } from "@/ui/copy";

export function TaskDeclineFeedback({ mutation }: Pick<MutationStateProps, "mutation">) {
  const copy = useCopy();
  return mutation.error instanceof Error && mutation.error.message.includes("Unsupported host method") ? (
    <Notice tone="info" message={copy(
      "Önerileri reddetmek için bilgisayardaki bycoda uygulamasını güncelleyin.",
      "Update bycoda on this computer to decline suggestions.",
    )} />
  ) : <MutationState mutation={mutation} />;
}
