import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Body, NavigationGroup, ValueRow } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { prReviewDecisionLabel, providerActionLabel } from "../inbox/provider-labels";
import { providerName } from "../inbox/provider-model";
import type { ApprovalView } from "./approvals-model";

type Details = NonNullable<ApprovalView["details"]>;

const REVIEW_EVENTS = new Set(["COMMENT", "APPROVE", "REQUEST_CHANGES"]);
/** Commits read like the rest of the app: a short, selectable mono hash. */
const shortSha = (sha: string) => sha.slice(0, 7);

/** The Inbox write the owner is approving, in the same fields the desktop dialog shows. */
export function ApprovalDetails({ details }: { details: Details }) {
  const copy = useCopy();
  const action =
    details.action === "comment"
      ? copy("Yorum", "Comment")
      : details.action === "review"
        ? copy("İnceleme", "Review")
        : copy("Pull request işlemi", "Pull request action");
  const event = details.review?.event;
  const rows: [string, string | undefined][] = [
    [copy("İşlem", "Action"), action],
    [copy("Proje", "Project"), details.project],
    [copy("Sağlayıcı", "Provider"), details.provider ? providerName(details.provider) : undefined],
    [copy("Hedef", "Target"), details.target],
    [copy("Yanıtlanan", "Reply to"), details.replyTo],
    [copy("Konu", "Thread"), details.thread],
    [copy("İşlem türü", "Operation"), details.prAction ? providerActionLabel(details.prAction, copy) : undefined],
    [copy("İnceleme sonucu", "Review verdict"), event
      ? REVIEW_EVENTS.has(event) ? prReviewDecisionLabel(event as "COMMENT" | "APPROVE" | "REQUEST_CHANGES", copy) : event
      : undefined],
  ];
  const commits: [string, string | undefined][] = [
    [copy("Güncel commit", "Head commit"), details.headSha],
    [copy("İnceleme commit'i", "Review commit"), details.review?.commitId],
  ];
  return (
    <View style={{ gap: space.xs }}>
      <NavigationGroup>
        {rows.map(([label, value]) => (value ? <ValueRow key={label} label={label} value={value} /> : null))}
        {commits.map(([label, value]) => (value ? (
          <ValueRow key={label} label={label}
            trailing={<Body mono muted selectable>{shortSha(value)}</Body>} />
        ) : null))}
      </NavigationGroup>
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
