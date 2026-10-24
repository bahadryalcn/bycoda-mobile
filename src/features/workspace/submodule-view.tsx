import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, Button, Notice, QueryState, ScreenList, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { readInitializedSubmodules } from "./submodule-model";
export function SubmoduleView({ machineId, projectId, cwd, onClose }: { machineId: string; projectId: string; cwd: string; onClose: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const supported = machine?.id === machineId && machine.capabilities?.includes("workspace.run");
  const query = useHostQuery<string[]>(["initialized-submodules", projectId, cwd], "workspace.run", { command: "git_submodules", args: { cwd } }, {
    enabled: !!supported && !!cwd,
    queryFn: async (client, signal) => readInitializedSubmodules(await client.request("workspace.run", { command: "git_submodules", args: { cwd } }, { signal })),
  });
  return <Sheet visible title={copy("Başlatılmış submodule’ler", "Initialized submodules")} size="full" scroll={false} onClose={onClose}>
    <ScreenList data={supported ? query.data ?? [] : []} keyExtractor={(path) => path}
      header={<View style={{ gap: space.sm }}><Body mono>{cwd}</Body>
        <Body muted>{copy("Yalnız bu çalışma klasöründeki başlatılmış iç depolar listelenir. Başlatılmamış submodule’ler dahil değildir.", "Lists initialized nested repositories in this checkout only. Uninitialized submodules are excluded.")}</Body>
        {!supported ? <Notice message={copy("Submodule incelemesi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to review submodules.")} /> : <><QueryState query={query} empty={query.isSuccess && !query.data?.length} emptyTitle={copy("Başlatılmış submodule yok.", "No initialized submodules.")} /><Button tone="quiet" label={copy("Yenile", "Refresh")} disabled={query.isFetching} onPress={() => { void query.refetch(); }} /></>}
      </View>} renderItem={({ item }) => <Body mono>{item}</Body>} />
  </Sheet>;
}
