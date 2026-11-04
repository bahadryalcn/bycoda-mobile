import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { safeRemoteUrl, type GitManagementDraft, type GitManagementRow } from "./git-management-model";

export type GitManagementReviewContent = {
  title: string; machineName: string; root: string; branch: string | null; head: string | null;
  action: GitManagementDraft["action"]; args: Readonly<Record<string, unknown>>;
  warning: string; remotes: readonly GitManagementRow[];
};

/** Presentation only. The editor owns the frozen request and final preflight. */
export function GitManagementReview({ review, onClose, onConfirm }: {
  review: GitManagementReviewContent; onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  const labels: Record<string, string> = {
    from: copy("Dal adı", "Branch name"), to: copy("Yeni dal adı", "New branch name"),
    name: review.action === "addRemote" || review.action === "removeRemote" ? copy("Uzak depo adı", "Remote name")
      : review.action === "createTag" || review.action === "deleteTag" ? copy("Etiket adı", "Tag name") : copy("Dal adı", "Branch name"),
    reference: copy("Kaynak dal", "Source branch"), sha: copy("Tam commit SHA’sı", "Full commit SHA"),
    expectedTargetSha: copy("Tam commit SHA’sı", "Full commit SHA"), mode: copy("Sıfırlama etkisi", "Reset effect"),
    url: copy("Uzak depo URL’si", "Remote URL"), remote: copy("Uzak depo", "Remote"),
    force: copy("Birleştirilmemiş commit’ler olsa da sil", "Delete even with unmerged commits"),
    title: copy("Başlık", "Title"), body: copy("Açıklama", "Description"),
    base: copy("Hedef dal (base)", "Base branch"), head: copy("Kaynak dal (head)", "Head branch"),
    repository: copy("Depo", "Repository"),
  };
  const value = (key: string, entry: unknown) => key === "url" ? safeRemoteUrl(String(entry))
    : key === "mode" ? entry === "hard" ? copy("İzlenen dosya değişikliklerini sil", "Discard tracked file changes")
      : entry === "mixed" ? copy("Dosyaları unstaged tut", "Keep changes unstaged") : copy("Dosyaları staged tut", "Keep changes staged")
    : typeof entry === "boolean" ? entry ? copy("Evet", "Yes") : copy("Hayır", "No") : String(entry);
  const destructive = ["deleteBranch", "deleteRemoteBranch", "deleteTag", "removeRemote", "rebase", "reset", "undoCommit"].includes(review.action);
  return <ActionReviewSheet title={review.title} submitLabel={review.title} tone={destructive ? "danger" : undefined} onClose={onClose} onConfirm={onConfirm} scroll={false}>
    <ScreenList data={review.remotes} keyExtractor={(remote, index) => `${remote.name}:${index}`}
      header={<Stack>
        <Body selectable>{review.machineName}</Body>
        <Body mono selectable>{review.root}</Body>
        <Body selectable>{copy("Mevcut dal", "Current branch")}: {review.branch ?? "HEAD"}</Body>
        {review.head ? <Body mono selectable>{review.head}</Body> : null}
        {review.warning ? <Notice tone="warning" message={review.warning} /> : null}
        {Object.entries(review.args).filter(([key]) => key !== "cwd" && key !== "expectedSnapshot").map(([key, entry]) => <Stack key={key}>
          <Body muted>{labels[key] ?? key}</Body><Body selectable>{value(key, entry)}</Body>
        </Stack>)}
        {review.remotes.length ? <Body muted>{copy("Uzak depolar", "Remotes")}</Body> : null}
      </Stack>}
      renderItem={({ item }) => <Stack><Body selectable>{item.name}</Body><Body muted selectable>{safeRemoteUrl(item.url ?? "")}</Body></Stack>} />
  </ActionReviewSheet>;
}
