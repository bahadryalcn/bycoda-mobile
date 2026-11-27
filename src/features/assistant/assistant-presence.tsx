import { useRef, useState } from "react";
import { View } from "react-native";
import type { AssistantSnapshot } from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient, OwnerPresence } from "./assistant-client";
import { useCopy } from "@/ui/copy";
import { ErrorNotice, NavigationGroup, Notice, SelectField, StatusText } from "@/ui/primitives";
import { space } from "@/ui/tokens";

/**
 * Settings → Assistant → Status: the owner's chosen presence and what the assistant sees right now.
 * A change whose outcome is unknown is never resent; the owner reads the current status instead.
 */
export function AssistantPresence({ client, snapshot, enabled, current, onChanged, onInspected, onBusyChange }: {
  client: AssistantMobileClient;
  snapshot: AssistantSnapshot;
  enabled: boolean;
  current(): boolean;
  /** Reads the snapshot again after a confirmed change. */
  onChanged(): Promise<void>;
  /** The snapshot an explicit status read returned. */
  onInspected(snapshot: AssistantSnapshot): void;
  onBusyChange?(busy: boolean): void;
}) {
  const copy = useCopy();
  const [busyKind, setBusyKind] = useState<"inspect" | `presence-${OwnerPresence}` | null>(null);
  const [issue, setIssue] = useState<unknown>(null), [unknown, setUnknown] = useState(false);
  const pending = useRef(false);
  const busy = busyKind !== null;
  const perform = async (kind: NonNullable<typeof busyKind>, action: () => Promise<void>) => {
    if (pending.current || !current() || !enabled) return;
    pending.current = true;
    setBusyKind(kind);
    onBusyChange?.(true);
    setIssue(null);
    try {
      await action();
    } catch (error) {
      if (current()) setIssue(error);
    } finally {
      pending.current = false;
      if (current()) { setBusyKind(null); onBusyChange?.(false); }
    }
  };
  const setPresence = (value: OwnerPresence) =>
    void perform(`presence-${value}`, async () => {
      try {
        await client.setPresence(value);
      } catch (error) {
        if (current()) setUnknown(client.pendingPresence?.status === "unknown");
        throw error;
      }
      await onChanged();
    });
  const inspect = () =>
    void perform("inspect", async () => {
      const value = await client.inspectPresence();
      if (!current()) return;
      onInspected(value);
      setUnknown(false);
    });
  // What the assistant sees right now: the computer's own activity can differ from the chosen presence.
  const presenceNow = snapshot.effectivePresence ? ({
    present: copy("Buradayım", "Here"),
    idle: copy("Boşta", "Idle"),
    away: copy("Uzağım", "Away"),
    dnd: copy("Rahatsız etmeyin", "Do not disturb"),
  } as const)[snapshot.effectivePresence] : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <NavigationGroup>
        <SelectField
          variant="row"
          label={copy("Durumum", "My presence")}
          value={snapshot.presence.state}
          disabled={busy || unknown || !enabled}
          options={[
            { value: "present", label: copy("Buradayım", "Here") },
            { value: "away", label: copy("Uzağım", "Away") },
            { value: "dnd", label: copy("Rahatsız etmeyin", "Do not disturb") },
          ]}
          onChange={(value) => { if (value !== snapshot.presence.state) setPresence(value as OwnerPresence); }}
        />
      </NavigationGroup>
      {presenceNow ? <StatusText label={copy("Şu an: {p0}", "Right now: {p0}", { p0: presenceNow })} /> : null}
      {unknown ? (
        <Notice
          tone="warning"
          message={copy(
            "Durum değişikliği doğrulanamadı. Otomatik olarak yeniden gönderilmeyecek.",
            "The status change could not be confirmed. It will not be resent automatically.",
          )}
          action={{ label: copy("Güncel durumu oku", "Read current status"), onPress: () => { if (!busy) inspect(); } }}
        />
      ) : issue ? <ErrorNotice error={issue} /> : null}
    </View>
  );
}
