import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { GitStash, StashOperation } from "./git-stash-model";

export type StashReviewOperation = Exclude<StashOperation, { kind: "create" }>;
export function GitStashIdentity({ stash }: { stash: GitStash }) {
  return <Stack>
    <Body selectable>stash@{`{${stash.index}}`} · {new Date(stash.timestamp * 1000).toLocaleDateString()}</Body>
    <Body mono selectable>{stash.sha}</Body>
    <Body selectable>{stash.message}</Body>
  </Stack>;
}

/** The caller retains exact snapshot/SHA authority; this owner only presents it. */
export function GitStashReview({ title, machineName, root, operation, onClose, onConfirm }: {
  title: string; machineName: string; root: string; operation: StashReviewOperation;
  onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  const stashes = operation.kind === "clear" ? operation.stashes : [operation.stash];
  return <ActionReviewSheet title={title} submitLabel={title} scroll={false}
    tone={operation.kind === "drop" || operation.kind === "clear" ? "danger" : undefined} onClose={onClose} onConfirm={onConfirm}>
    <ScreenList data={stashes} keyExtractor={stash => `${stash.index}:${stash.sha}`} header={<Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{root}</Body>
      {operation.kind === "clear" ? <>
        <Notice tone="warning" message={copy("İncelediğin listedeki tüm stash’ler kalıcı olarak silinecek.", "All stashes in the reviewed list will be permanently deleted.")} />
        <Body>{copy("Stash’ler", "Stashes")}: {stashes.length}</Body>
      </> : null}
    </Stack>} renderItem={({ item }) => <GitStashIdentity stash={item} />} />
  </ActionReviewSheet>;
}
