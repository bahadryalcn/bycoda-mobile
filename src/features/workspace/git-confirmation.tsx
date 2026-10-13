import { Body, CodePanel, CodeText, ConfirmationCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { GitConfirmationCardProps } from "./git-types";

export function GitConfirmationCard({
  confirmation,
  busy,
  onCancel,
  onConfirm,
}: GitConfirmationCardProps) {
  const copy = useCopy();
  let message: string;
  let label: string;
  let tone: "default" | "danger" = "default";

  switch (confirmation.kind) {
    case "operation":
      message =
        confirmation.choice === "abort"
          ? copy(
              "Devam eden Git işlemini iptal edip önceki duruma dön?",
              "Abort the Git operation and return to its previous state?",
            )
          : copy(
              "Çözülmüş değişikliklerle Git işlemine devam et?",
              "Continue the Git operation with the resolved changes?",
            );
      label =
        confirmation.choice === "abort"
          ? copy("İptal etmeyi onayla", "Confirm abort")
          : copy("Devam etmeyi onayla", "Confirm continuation");
      tone = confirmation.choice === "abort" ? "danger" : "default";
      break;
    case "switch":
      message = `${copy("Bu dala geç:", "Switch to:")} ${confirmation.branch}`;
      label = copy("Dala geç", "Switch branch");
      break;
    case "resolve":
      message = `${confirmation.path} · ${
        confirmation.side === "ours"
          ? copy("Bizim sürüm kullanılacak.", "Our version will be used.")
          : copy("Gelen sürüm kullanılacak.", "The incoming version will be used.")
      }`;
      label = copy("Bu sürümü uygula", "Use this version");
      break;
    case "discard":
      message = `${confirmation.path} · ${copy(
        "Kaydedilmemiş Git değişiklikleri kalıcı olarak bırakılacak.",
        "Uncommitted Git changes will be permanently discarded.",
      )}`;
      label = copy("Geri almayı onayla", "Confirm discard");
      tone = "danger";
      break;
    case "commit":
      message = copy(
        "Stage’deki dosyalar bu mesajla bilgisayarda commit edilsin mi?",
        "Commit the staged files on your computer with this message?",
      );
      label = copy("Commit et", "Commit changes");
      break;
    case "pull":
      message = copy(
        "Uzak depodaki commit’ler bilgisayarındaki bu dala alınsın mı?",
        "Pull the remote commits into this branch on your computer?",
      );
      label = copy("Pull et", "Pull commits");
      break;
    case "push":
      message = copy(
        "Bu dalın commit’leri uzak Git deposuna gönderilsin mi?",
        "Send this branch’s commits to the remote Git repository?",
      );
      label = copy("Push et", "Push commits");
      break;
  }

  return (
    <>
      {confirmation.context ? (
        <>
          <Body muted>
            {confirmation.context.machine} · {confirmation.context.branch ?? "HEAD"}
          </Body>
          <Body mono muted selectable>
            {confirmation.context.root}
          </Body>
          {confirmation.kind === "commit" ? (
            <>
              <CodePanel>
                <CodeText>{confirmation.context.message}</CodeText>
              </CodePanel>
              <Body muted>{confirmation.context.files.join("\n")}</Body>
            </>
          ) : null}
        </>
      ) : null}
      <ConfirmationCard
        message={message}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={onCancel}
        confirmLabel={label}
        onConfirm={onConfirm}
        tone={tone}
        busy={busy}
      />
    </>
  );
}
