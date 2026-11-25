import { useRef, useState } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Empty, Notice, QueryState, Screen, ScreenList } from "@/ui/primitives";
import { useActiveMachine } from "@/state/machines";
import { NoComputerState } from "@/ui/no-computer";
import { useConnectionScope } from "@/state/connection-scope";
import { ApprovalCard, type LocalDecision } from "./approval-card";
import { ApprovalDecisionError } from "./approvals-client";
import { sortApprovals, type ApprovalView } from "./approvals-model";
import { useApprovals } from "./use-approvals";

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
  const [local, setLocal] = useState<Record<string, { state: LocalDecision; approved: boolean }>>({});
  const [checking, setChecking] = useState(false);
  // The ref is the synchronous one-at-a-time guard; the state mirrors it so other cards can show why they wait.
  const sending = useRef(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const title = copy("Onaylar", "Approvals");
  if (!machine)
    return (
      <Screen title={title} scroll={false}>
        <View style={{ flex: 1 }}>
          <NoComputerState
            description={copy("Onay isteklerini görmek için bilgisayarını bağla.", "Connect your computer to see approval requests.")}
          />
        </View>
      </Screen>
    );
  if (!supported)
    return (
      <Screen title={title} scroll={false}>
        <View style={{ flex: 1 }}>
          <Empty
            compact={false}
            title={copy("Henüz kullanılamıyor", "Not available yet")}
            detail={copy(
              "{p0} onayları telefona göndermiyor; bycoda'yı orada güncelle.",
              "{p0} does not send approvals to phones yet; update bycoda there.",
              { p0: machine.name },
            )}
          />
        </View>
      </Screen>
    );
  const mark = (id: string, state: LocalDecision, approved: boolean) =>
    setLocal((old) => ({ ...old, [id]: { state, approved } }));
  const decide = async (approval: ApprovalView, approved: boolean) => {
    if (!client || sending.current || !current()) return;
    sending.current = true;
    setSendingId(approval.id);
    mark(approval.id, "sending", approved);
    try {
      await client.decide(approval, approved);
      if (current()) mark(approval.id, "sent", approved);
    } catch (error) {
      const refused = error instanceof ApprovalDecisionError && error.code === "rejected";
      if (current()) mark(approval.id, refused ? "rejected" : "uncertain", approved);
    } finally {
      sending.current = false;
      if (current()) setSendingId(null);
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
      // Approvals belong to the active computer; switching computers lists the other computer's.
      computerSwitch
      scope={{ computer: machine.name }}
      header={
        <>
          {/* With nothing listed the empty slot owns the page, so a failed load is centered there instead. */}
          {sorted.length ? <QueryState query={query} /> : null}
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
      ListEmptyComponent={
        <>
          <QueryState query={query} />
          {/* A loaded empty list stays an empty page even while a later refresh fails. */}
          {query.data !== undefined ? (
            <Empty
              compact={false}
              illustration="success"
              title={copy("Bekleyen onay yok", "Nothing waiting for approval")}
              detail={copy("Bir ajan izin istediğinde burada görünür.", "When an agent asks for permission, it shows up here.")}
            />
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <ApprovalCard
          approval={item}
          local={local[item.id]?.state}
          sentApproved={local[item.id]?.approved}
          canDecide={!!client}
          onDecide={(approval, approved) => void decide(approval, approved)}
          onCheck={() => void check()}
          checking={checking}
          waitingForOther={sendingId !== null && sendingId !== item.id}
        />
      )}
    />
  );
}
