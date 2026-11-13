import { useRef, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Empty, Notice, QueryState, Screen, ScreenList } from "@/ui/primitives";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { ApprovalCard, type LocalDecision } from "./approval-card";
import { ApprovalDecisionError } from "./approvals-client";
import { approvalOpen, sortApprovals, type ApprovalView } from "./approvals-model";
import { useApprovals, useNow } from "./use-approvals";

/** Owner approvals the computer mirrors to this phone; the computer settles each one, this screen only sends the answer. */
export function ApprovalsScreen({ focusId }: { focusId?: string }) {
  const machine = useActiveMachine();
  const scope = useConnectionScope();
  return <ApprovalsWorkspace key={scope.token} machine={machine} current={scope.isCurrent} focusId={focusId} />;
}

/** Local decisions belong to one reviewed Host epoch, including an A/B/A route change. */
function ApprovalsWorkspace({ machine, current, focusId }: {
  machine: ReturnType<typeof useActiveMachine>;
  current(): boolean;
  focusId?: string;
}) {
  const copy = useCopy();
  const { query, client, supported, approvals } = useApprovals();
  const now = useNow();
  const [local, setLocal] = useState<Record<string, { state: LocalDecision; approved: boolean }>>({});
  const [checking, setChecking] = useState(false);
  const sending = useRef(false);
  const title = copy("Onaylar", "Approvals");
  if (!machine)
    return (
      <Screen title={title} scroll={false}>
        <View style={{ flex: 1 }}>
          <Empty
            compact={false}
            illustration="connect-computer"
            title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
            action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.push("/machines") }}
          />
        </View>
      </Screen>
    );
  if (!supported)
    return (
      <Screen title={title}>
        <Notice
          message={copy(
            "{p0} onayları telefona göndermiyor; bycoda'yı orada güncelle.",
            "{p0} does not send approvals to phones yet; update bycoda there.",
            { p0: machine.name },
          )}
        />
      </Screen>
    );
  const mark = (id: string, state: LocalDecision, approved: boolean) =>
    setLocal((old) => ({ ...old, [id]: { state, approved } }));
  const decide = async (approval: ApprovalView, approved: boolean) => {
    if (!client || sending.current || !current()) return;
    sending.current = true;
    mark(approval.id, "sending", approved);
    try {
      await client.decide(approval, approved);
      if (current()) mark(approval.id, "sent", approved);
    } catch (error) {
      const refused = error instanceof ApprovalDecisionError && error.code === "rejected";
      if (current()) mark(approval.id, refused ? "rejected" : "uncertain", approved);
    } finally {
      sending.current = false;
      // The computer settles its own dialog; the list poll picks up the final status.
      if (current()) void query.refetch();
    }
  };
  const check = async () => {
    if (!current()) return;
    const uncertain = new Set(Object.entries(local).filter(([, value]) => value.state === "uncertain").map(([id]) => id));
    setChecking(true);
    try {
      const result = await query.refetch();
      if (!current() || !result.isSuccess) return;
      // The list is authoritative now; a still-pending item may be answered again by hand.
      setLocal((old) => Object.fromEntries(Object.entries(old).filter(([id, value]) => value.state !== "uncertain" || !uncertain.has(id))));
    } finally {
      if (current()) setChecking(false);
    }
  };
  const sorted = sortApprovals(approvals, focusId);
  const missingFocus = !!focusId && query.isSuccess && !approvals.some((approval) => approval.id === focusId);
  return (
    <ScreenList
      title={title}
      subtitle={machine.name}
      header={
        <>
          <QueryState query={query} />
          {missingFocus ? (
            <Notice
              message={copy(
                "Bu onay artık listede yok; süresi dolmuş olabilir.",
                "That approval is no longer listed; it may have expired.",
              )}
            />
          ) : null}
        </>
      }
      data={sorted}
      keyExtractor={(approval) => approval.id}
      refresh={async () => void (await query.refetch())}
      ListEmptyComponent={query.isSuccess ? (
        <Empty
          compact
          illustration="chat-empty"
          title={copy("Bekleyen onay yok", "Nothing waiting for approval")}
        />) : undefined}
      renderItem={({ item }) => (
        <ApprovalCard
          approval={item}
          now={now}
          local={approvalOpen(item, now) ? local[item.id]?.state : undefined}
          sentApproved={local[item.id]?.approved}
          canDecide={!!client}
          onDecide={(approval, approved) => void decide(approval, approved)}
          onCheck={() => void check()}
          checking={checking}
        />
      )}
    />
  );
}
