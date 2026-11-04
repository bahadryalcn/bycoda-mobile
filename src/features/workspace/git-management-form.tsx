import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { Body, Field, FormActions, Notice, SelectField, Stack, ToggleField } from "@/ui/primitives";
import type { GitManagementAction, GitManagementDraft } from "./git-management-model";

export function useGitManagementLabels(): Record<GitManagementAction, string> {
  const copy = useCopy();
  return {
    renameBranch: copy("Dalın adını değiştir", "Rename branch"), deleteBranch: copy("Yerel dalı sil", "Delete local branch"),
    deleteRemoteBranch: copy("Uzak dalı sil", "Delete remote branch"), createTag: copy("Etiket oluştur", "Create tag"), deleteTag: copy("Etiketi sil", "Delete tag"),
    addRemote: copy("Uzak depo ekle", "Add remote"), removeRemote: copy("Uzak depo kaydını kaldır", "Remove remote"),
    merge: copy("Dalı birleştir", "Merge branch"), rebase: copy("Dalı yeniden tabanla", "Rebase branch"),
    cherryPick: copy("Commit’i uygula", "Cherry-pick commit"), revert: copy("Commit’i tersine çevir", "Revert commit"),
    reset: copy("Commit’e sıfırla", "Reset to commit"), undoCommit: copy("Son commit’i geri al", "Undo last commit"),
    createPr: copy("Pull request oluştur", "Create pull request"),
  };
}

export function GitManagementForm({ value, onChange, busy, disabled, error, branchOptions, onSubmit, onCancel, feedback }: {
  value: GitManagementDraft; onChange: (value: GitManagementDraft) => void; busy: boolean; disabled: boolean; error?: string;
  branchOptions: { value: string; label: string }[]; onSubmit: () => void; onCancel: () => void; feedback: React.ReactNode;
}) {
  const copy = useCopy();
  const labels = useGitManagementLabels();
  const { requestClose } = useSheetGuard({ pending: busy, onClose: onCancel });
  const action = value.action;
  const patch = (values: Partial<GitManagementDraft>) => onChange({ ...value, ...values });
  const locked = busy || disabled;
  const needsName = ["renameBranch", "deleteBranch", "deleteRemoteBranch", "createTag", "deleteTag", "addRemote", "removeRemote"].includes(action);
  return <Stack>
    {needsName && <Field label={action === "addRemote" || action === "removeRemote" ? copy("Uzak depo adı", "Remote name") : action === "createTag" || action === "deleteTag" ? copy("Etiket adı", "Tag name") : copy("Dal adı", "Branch name")}
      value={value.name} editable={!locked && ["createTag", "addRemote"].includes(action)} onChangeText={(name) => patch({ name })} />}
    {action === "renameBranch" && <Field label={copy("Yeni dal adı", "New branch name")} value={value.target} editable={!locked} onChangeText={(target) => patch({ target })} />}
    {action === "deleteRemoteBranch" && <Body>{copy("Uzak depo", "Remote")}: {value.remote}</Body>}
    {action === "deleteBranch" && <ToggleField label={copy("Birleştirilmemiş commit’ler olsa da sil", "Delete even with unmerged commits")} value={value.force} disabled={locked} onChange={(force) => patch({ force })} />}
    {action === "addRemote" && <Field label={copy("Uzak depo URL’si", "Remote URL")} value={value.url} editable={!locked} onChangeText={(url) => patch({ url })} autoCapitalize="none" />}
    {(action === "merge" || action === "rebase") && <SelectField searchable label={copy("Kaynak dal", "Source branch")} value={value.target} options={branchOptions} disabled={locked} onChange={(target) => patch({ target })} />}
    {["createTag", "cherryPick", "revert", "reset"].includes(action) && <Field label={copy("Tam commit SHA’sı", "Full commit SHA")} value={value.sha} editable={!locked} onChangeText={(sha) => patch({ sha })} autoCapitalize="none" />}
    {action === "reset" && <SelectField label={copy("Sıfırlama etkisi", "Reset effect")} value={value.mode} disabled={locked} onChange={(mode) => patch({ mode })}
      options={[{ value: "soft", label: copy("Dosyaları staged tut", "Keep changes staged") }, { value: "mixed", label: copy("Dosyaları unstaged tut", "Keep changes unstaged") }, { value: "hard", label: copy("İzlenen dosya değişikliklerini sil", "Discard tracked file changes") }]} />}
    {action === "undoCommit" && <Notice tone="warning" message={copy("Son commit kaldırılır; değişiklikleri staged kalır. İlk commit veya merge commit’i geri alınamaz.", "The last commit is removed; its changes stay staged. Initial and merge commits cannot be undone.")} />}
    {(action === "deleteRemoteBranch" || action === "createPr") && <Notice tone="warning" message={copy("Bu işlem uzak hizmeti değiştirir. Son onayda hedefi kontrol edin.", "This changes the remote service. Review the destination in the final confirmation.")} />}
    {action === "createPr" && <>
      <Field label={copy("Başlık", "Title")} value={value.title} editable={!locked} onChangeText={(title) => patch({ title })} />
      <Field label={copy("Açıklama", "Description")} value={value.body} editable={!locked} multiline onChangeText={(body) => patch({ body })} />
      <Field label={copy("Hedef dal (base)", "Base branch")} value={value.base} editable={!locked} onChangeText={(base) => patch({ base })} />
      <Field label={copy("Kaynak dal (head)", "Head branch")} value={value.head} editable={!locked} onChangeText={(head) => patch({ head })} />
    </>}
    {error && <Body muted>{error}</Body>}
    <FormActions submitLabel={labels[action]} disabled={locked || !!error} busy={busy} onSubmit={onSubmit} onCancel={requestClose}
      cancelDisabled={busy} cancelLabel={copy("Vazgeç", "Cancel")} feedback={feedback} />
  </Stack>;
}
