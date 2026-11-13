import { useState } from "react";
import { View } from "react-native";
import { Body, Button, QueryState, Row } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { PrivateContentAccessProvider } from "@/ui/private-access";
import { listFixtureData, listFixtureModes, type ListFixtureMode } from "./list-stress-fixtures";
import { ProjectRow } from "./project-row";
import { SessionListRow } from "./session-list-row";
import type { HostSessionSummary } from "./wire";
import { ContentStressScreen } from "./content-stress-screen";
import { UiCoherenceStressScreen } from "./ui-coherence-stress-screen";

const denyAccess = () => false;
const noAction = () => {};
const fixtureAccess = { allowed: false, check: denyAccess };

/** Developer fixtures only. Real row owners render; no connection, draft write or Host action is enabled. */
export function WorkspaceStressScreen() {
  const [mode, setMode] = useState<ListFixtureMode>("Demo");
  const [surface, setSurface] = useState<"projects" | "sessions" | "chat" | "models" | "limits">("sessions");
  const [loading, setLoading] = useState(false);
  const data = listFixtureData(mode);
  const surfaceControl = <Row>{([
    { value: "projects", label: "Projects" }, { value: "sessions", label: "Sessions" }, { value: "chat", label: "Chat" },
    { value: "models", label: "Models" }, { value: "limits", label: "Limits" },
  ] as const).map(option => <Button key={option.value} label={option.label} selected={surface === option.value} onPress={() => setSurface(option.value)} />)}</Row>;
  return <PrivateContentAccessProvider value={fixtureAccess}>
    {surface === "models" || surface === "limits" ? <UiCoherenceStressScreen surface={surface} header={surfaceControl} /> : surface === "chat" ? <ContentStressScreen header={surfaceControl} /> :
    <ScreenList
      title="Workspace fixtures"
      data={loading ? [] : data}
      keyExtractor={item => item.id}
      header={<View>
        <Body muted>Developer fixtures. Host actions and draft reads are disabled.</Body>
        {surfaceControl}
        <Row>{listFixtureModes.map(value => <Button key={value} label={value} selected={mode === value} onPress={() => setMode(value)} />)}</Row>
        <Button label={loading ? "Show content" : "Show loading"} onPress={() => setLoading(!loading)} />
      </View>}
      ListEmptyComponent={<QueryState query={loading
        ? { status: "pending", fetchStatus: "fetching", isPending: true }
        : { status: "success", data: [] }} empty={!loading} />}
      renderItem={({ item, index }) => {
        if (surface === "projects") return <ProjectRow id={item.id} name={item.title}
          depth={mode === "Worst" ? index % 4 : 0} grouped={false} registered running={index % 3 === 0 ? 12 : 0}
          activeAt={index % 3 ? Date.now() - 21 * 86_400_000 : undefined}
          opening={false} disabled={false} onPress={noAction} onDetails={noAction} onOpenView={noAction} />;
        const session: HostSessionSummary = {
          id: item.id, title: item.title, projectId: "fixture-project", revision: 1,
          harness: item.harness === "claude" ? "claude" : "codex", status: item.status === "running" ? "running" : "idle",
          updatedAt: 1_799_000_000_000, branch: item.branch,
        };
        return <SessionListRow machineId="fixture-machine" projectId={session.projectId} projectName={item.projectName}
          showProject session={session} canRead={denyAccess} onPress={noAction} />;
      }}
    />}
  </PrivateContentAccessProvider>;
}
