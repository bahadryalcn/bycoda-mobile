import { Body, CodePanel, CodeText, FormActions } from "@/ui/primitives";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { gitAheadCount } from "./git-commit-model";
import type { GitConfirmationReviewProps } from "./git-types";

export function GitConfirmationReview({
  confirmation,
  busy,
  stageAll = false,
  onCancel,
  onConfirm,
}: GitConfirmationReviewProps & {
  /** The commit stages every changed file first; the review says so instead of "the staged files". */
  stageAll?: boolean;
}) {
  useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  let message: string;
  let label: string;
  // The reviewed action is the sheet's one primary step; destructive choices stay danger.
  let tone: "primary" | "danger" = "primary";

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
      tone = confirmation.choice === "abort" ? "danger" : "primary";
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
      message = stageAll
        ? copy(
            "Listelenen tüm değişiklikler hazırlanıp bu mesajla bilgisayarda commit edilsin mi?",
            "Stage every listed change and commit it on your computer with this message?",
          )
        : copy(
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
      <Body>{message}</Body>
      {confirmation.context ? (
        <>
          <Body muted>
            {confirmation.context.machine} · {confirmation.context.branch ?? "HEAD"}
          </Body>
          <Body mono muted selectable>
            {confirmation.context.root}
          </Body>
          {confirmation.kind === "push" && confirmation.context.pushTarget ? (
            <Body selectable>
              {`${confirmation.context.pushTarget} · ${gitAheadCount(confirmation.context.ahead ?? 0, copy, numbers.format)}`}
            </Body>
          ) : null}
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
      {/* The confirmation sheet's actions render in its shared footer. */}
      <FormActions
        submitLabel={label}
        onSubmit={onConfirm}
        tone={tone}
        busy={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={onCancel}
      />
    </>
  );
}
