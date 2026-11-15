import { sessionRetryNotice } from "../../../../src/features/sessions/model/sessionIssue";
import { useRef, useState } from "react";
import { Button, Notice, Row } from "@/ui/primitives";
import { ChatStreaming } from "@/ui/chat-activity";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { View } from "react-native";

/** Desktop's placeholder while the running turn has not produced anything readable yet. */
export function ThinkingPlaceholder() {
  const copy = useCopy();
  return (
    <View style={{ paddingVertical: space.xs }}>
      <ChatStreaming label={copy("Düşünüyor…", "Thinking…")} />
    </View>
  );
}

/** The provider retries on its own; like desktop, Refresh re-reads the turn and Stop cancels it. */
export function ProviderRetryNotice({
  provider,
  message,
  disabled,
  stopping,
  onStop,
  onRefresh,
}: {
  provider: string;
  message: string;
  disabled: boolean;
  stopping: boolean;
  onStop: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const copy = useCopy();
  const notice = sessionRetryNotice(message);
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const refresh = () => {
    if (pending.current) return;
    pending.current = true;
    setRefreshing(true);
    setRefreshFailed(false);
    void onRefresh()
      .catch(() => setRefreshFailed(true))
      .finally(() => {
        pending.current = false;
        setRefreshing(false);
      });
  };
  const title = notice.reconnecting
    ? copy("{p0} ile yeniden bağlanılıyor", "Reconnecting to {p0}", { p0: provider })
    : copy("{p0} yeniden deniyor", "{p0} is retrying", { p0: provider });
  return (
    <View style={{ gap: space.xxs }}>
      <Notice tone="warning" message={notice.detail ? `${title} · ${notice.detail}` : title}>
        <Row style={{ gap: space.xs, justifyContent: "flex-end" }}>
          <Button
            label={refreshing ? copy("Yenileniyor…", "Refreshing…") : copy("Yenile", "Refresh")}
            density="compact"
            tone="quiet"
            busy={refreshing}
            onPress={refresh}
          />
          <Button
            label={copy("Durdur", "Stop")}
            density="compact"
            tone="quiet"
            busy={stopping}
            disabled={disabled || refreshing}
            onPress={onStop}
          />
        </Row>
      </Notice>
      {refreshFailed ? (
        <Notice
          tone="danger"
          message={copy(
            "Bilgiler yenilenemedi. Son alınan bilgiler gösteriliyor.",
            "Could not refresh. Showing the last received information.",
          )}
        />
      ) : null}
    </View>
  );
}

/** A turn cut off without the owner stopping it; Continue sends desktop's continue prompt. */
export function InterruptedTurnNotice({
  disabled,
  onContinue,
}: {
  disabled: boolean;
  onContinue: () => void;
}) {
  const copy = useCopy();
  return (
    <Notice
      tone="warning"
      message={copy("Bu tur yarıda kesildi.", "This turn was cut off.")}
      action={disabled ? undefined : { label: copy("Devam et", "Continue"), onPress: onContinue }}
    />
  );
}
