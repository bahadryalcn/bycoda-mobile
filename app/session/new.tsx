import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewChatScreen } from "../../src/features/workspace/new-chat-screen";
import { TabletRail } from "../../src/features/workspace/tablet-rail";
import { TabletQuickPanel } from "../../src/features/workspace/tablet-quick-panel";
import { SessionComposerHeightProvider } from "../../src/features/workspace/session-keyboard-frame";
import { useTabletSessionBackFallback } from "../../src/features/workspace/session-header";
import { useAdaptiveLayout } from "../../src/ui/adaptive-layout";
import { ConnectionFeedbackScope } from "../../src/ui/connection-feedback-scope";
import { SplitView } from "../../src/ui/split-view";

/**
 * The empty new session (`/session/new`; the static segment takes precedence over `[id]`). Unlike
 * an open session it is not bound to one computer: the hero switches computer and project in place.
 */
export default function NewSessionRoute() {
  const { projectId, machineId, cwd, prompt, project } = useLocalSearchParams<{
    projectId?: string; machineId?: string; cwd?: string; prompt?: string; project?: string;
  }>();
  const { tablet } = useAdaptiveLayout();
  useTabletSessionBackFallback(tablet);
  const insets = useSafeAreaInsets();
  return (
    <ConnectionFeedbackScope sharedReads>
      <SplitView
        rail={tablet ? <TabletRail /> : null}
        detail={
          <View style={{ flex: 1 }}>
            <SessionComposerHeightProvider
              fallback={insets.bottom}
              overlay={(bottomInset) => <TabletQuickPanel bottomInset={bottomInset} />}
            >
              <NewChatScreen
                route={{
                  projectId: projectId || undefined,
                  machineId: machineId || undefined,
                  cwd: cwd || undefined,
                  prompt: prompt || undefined,
                  project: project || undefined,
                }}
                layout={tablet ? "tablet" : "phone"}
              />
            </SessionComposerHeightProvider>
          </View>
        }
      />
    </ConnectionFeedbackScope>
  );
}
