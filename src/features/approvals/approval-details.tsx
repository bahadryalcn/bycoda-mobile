import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Body } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { ApprovalView } from "./approvals-model";

type Details = NonNullable<ApprovalView["details"]>;

/** The Inbox write the owner is approving, in the same fields the desktop dialog shows. */
export function ApprovalDetails({ details }: { details: Details }) {
  const copy = useCopy();
  const action =
    details.action === "comment"
      ? copy("Yorum", "Comment")
      : details.action === "review"
        ? copy("İnceleme", "Review")
        : copy("Çekme isteği işlemi", "Pull request action");
  const rows: [string, string | undefined][] = [
    [copy("İşlem", "Action"), action],
    [copy("Proje", "Project"), details.project],
    [copy("Sağlayıcı", "Provider"), details.provider],
    [copy("Hedef", "Target"), details.target],
    [copy("Yanıtlanan", "Reply to"), details.replyTo],
    [copy("Konu", "Thread"), details.thread],
    [copy("İşlem türü", "Operation"), details.prAction],
    [copy("Güncel commit", "Head commit"), details.headSha],
    [copy("İnceleme sonucu", "Review verdict"), details.review?.event],
    [copy("İnceleme commit'i", "Review commit"), details.review?.commitId],
  ];
  return (
    <View style={{ gap: space.xs }}>
      {rows.map(([label, value]) =>
        value ? (
          <View key={label}>
            <Body muted>{label}</Body>
            <Body>{value}</Body>
          </View>
        ) : null,
      )}
      {details.body ? (
        <View>
          <Body muted>{copy("Metin", "Text")}</Body>
          <Body>{details.body}</Body>
        </View>
      ) : null}
      {details.review?.body ? (
        <View>
          <Body muted>{copy("İnceleme metni", "Review text")}</Body>
          <Body>{details.review.body}</Body>
        </View>
      ) : null}
      {details.review?.comments.length ? (
        <View style={{ gap: space.xs }}>
          <Body muted>{copy("Satır yorumları", "Line comments")}</Body>
          {details.review.comments.map((comment, index) => (
            <View key={`${comment.path}:${comment.line}:${index}`}>
              <Body mono>{`${comment.path}:${comment.line}`}</Body>
              <Body>{comment.body}</Body>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
