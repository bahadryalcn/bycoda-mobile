import type { GitDiffIndex } from "./wire";
import { gitAheadCount, gitBehindCount, gitChangedCount } from "./git-commit-model";
import { linkPullRequestReason } from "./git-link-pr-model";

export type GitSheetKey =
  | "commit" | "push" | "pull" | "fetch" | "branches" | "history" | "stashes" | "management" | "createPr" | "linkPr" | "refresh";
type CopyFn = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** Which git actions apply now, each with the reason when it does not. */
export function gitSheetActions(
  index: Pick<GitDiffIndex, "files" | "branch" | "defaultBranch" | "aheadOfDefault" | "headPushed" | "ahead" | "behind" | "remote" | "conflicts" | "operation">,
  opts: { busy: boolean; canRunWorkspace: boolean; /** Present only on Hosts that can link pull requests. */ linkPr?: { hasSession: boolean; linked?: { number: number } } },
  copy: CopyFn,
): { key: GitSheetKey; label: string; detail: string; disabled: boolean }[] {
  const staged = index.files.filter((file) => file.staged).length;
  const blocked = !!index.conflicts?.length || !!index.operation;
  const draftOnly = index.files.length === 0 && !blocked;
  const remoteReason = !index.remote ? copy("Bu dalın uzak deposu yok.", "This branch has no remote.") : "";
  const workspace = opts.busy || !opts.canRunWorkspace;
  const prReason = !index.remote ? remoteReason
    : !index.branch || index.branch === index.defaultBranch
      ? copy("Pull request için varsayılan daldan ayrı bir dalda olmalısın.", "Switch to a branch other than the default branch first.")
    : blocked ? copy("Çakışmaları veya devam eden işlemi önce bitir.", "Finish conflicts or the running operation first.")
    : index.aheadOfDefault === 0 ? copy("Bu dalda pull request’e eklenecek commit yok.", "This branch has no commits to include.")
    : !index.headPushed ? copy("Önce dalı push et.", "Push the branch first.")
    : "";
  const linkReason = opts.linkPr ? linkPullRequestReason({ remote: index.remote, hasSession: opts.linkPr.hasSession }, copy) : "";
  const linkRow = opts.linkPr ? [{ key: "linkPr" as const, label: copy("Pull request bağla", "Link pull request"), disabled: opts.busy || !!linkReason,
    detail: linkReason || (opts.linkPr.linked ? copy("#{p0} bağlı", "#{p0} linked", { p0: opts.linkPr.linked.number })
      : copy("Mevcut bir pull request’i bu oturuma bağla", "Attach an existing pull request to this session")) }] : [];
  return [
    { key: "commit", label: draftOnly ? copy("Commit mesajı", "Commit message") : copy("Commit", "Commit"), disabled: opts.busy,
      detail: blocked ? copy("Çakışmaları veya devam eden işlemi önce bitir.", "Finish conflicts or the running operation first.")
        : draftOnly ? copy("Kaydedilecek değişiklik yok.", "Nothing to commit.")
        : gitChangedCount(index.files.length, staged, copy) },
    { key: "push", label: copy("Push", "Push"), disabled: opts.busy || !index.remote || index.ahead === 0,
      detail: remoteReason || (index.ahead === 0 ? copy("Gönderilecek yerel commit yok.", "No local commits to push.")
        : gitAheadCount(index.ahead, copy)) },
    { key: "pull", label: copy("Pull", "Pull"), disabled: workspace || !index.remote,
      detail: remoteReason || (index.behind ? gitBehindCount(index.behind, copy)
        : copy("Uzak depodaki değişiklikleri al", "Bring in remote changes")) },
    { key: "fetch", label: copy("Fetch", "Fetch"), disabled: workspace || !index.remote,
      detail: remoteReason || copy("Uzak depoyu kontrol et, dosyalara dokunma", "Check the remote without touching files") },
    { key: "branches", label: copy("Dallar", "Branches"), disabled: opts.busy,
      detail: copy("Dal değiştir veya yeni dal oluştur", "Switch or create a branch") },
    { key: "history", label: copy("Commit geçmişi", "Commit history"), disabled: workspace,
      detail: copy("Önceki commit’leri incele", "Browse earlier commits") },
    { key: "stashes", label: copy("Stash’ler", "Stashes"), disabled: workspace,
      detail: copy("Kaydedilmiş stash’leri incele", "Browse saved stashes") },
    { key: "management", label: copy("Git yönetimi", "Git management"), disabled: workspace,
      detail: copy("Uzak depolar, etiketler ve daha fazlası", "Remotes, tags and more") },
    { key: "createPr", label: copy("Pull request oluştur", "Create pull request"), disabled: workspace || !!prReason,
      detail: prReason || copy("Oluştur veya mevcut pull request’i gör", "Create one or view the existing pull request") },
    ...linkRow,
    { key: "refresh", label: copy("Yenile", "Refresh"), disabled: opts.busy,
      detail: copy("Durumu yeniden oku", "Reload the status") },
  ];
}

