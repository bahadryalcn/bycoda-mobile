import { Component, useEffect, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { StateView } from "./state-view";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { logDiagnostic } from "../features/diagnostics/diagnostic-log";

/** Records a render failure for diagnostics: the error class and message, never component props. */
export function reportRenderFailure(scope: string, error: unknown) {
  const failure = error instanceof Error ? error : new Error(String(error));
  logDiagnostic("error", "mobile.render", "render failed", {
    scope,
    name: failure.name,
    message: failure.message.slice(0, 300),
  });
}

/**
 * Compact recovery screen for a crash of the whole app shell (Expo Router root `ErrorBoundary`).
 * It renders outside the app providers, so it depends only on the theme, copy and safe area.
 */
export function AppErrorScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  useEffect(() => { reportRenderFailure("app", error); }, [error]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <StateView
          size="region"
          tone="danger"
          title={copy("Bir şeyler ters gitti", "Something went wrong")}
          description={copy(
            "Bu ekran beklenmedik şekilde durdu. Taslakların ve bağlantıların yerinde.",
            "This screen stopped unexpectedly. Your drafts and connections are kept.",
          )}
          action={{ label: copy("Yeniden dene", "Try again"), onPress: () => { void retry(); } }}
          secondaryAction={{
            label: copy("Projelere git", "Go to projects"),
            onPress: () => {
              try { router.replace("/"); } catch { /* Navigation may not be mounted yet. */ }
              void retry();
            },
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function SectionFailure({ onRetry }: { onRetry: () => void }) {
  const copy = useCopy();
  return (
    <StateView
      size="compact"
      tone="danger"
      title={copy("Bu bölüm gösterilemedi", "This part couldn't be shown")}
      action={{ label: copy("Yeniden dene", "Try again"), onPress: onRetry }}
    />
  );
}

/**
 * Keeps one broken block (a sheet body, a transcript) from removing the whole screen: the block is
 * replaced by a compact state with Try again, which remounts it.
 */
export class SectionErrorBoundary extends Component<PropsWithChildren<{ scope: string; fallback?: (retry: () => void) => ReactNode }>, { error: unknown; attempt: number }> {
  state = { error: null as unknown, attempt: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("Render failed") };
  }
  componentDidCatch(error: unknown, _info: ErrorInfo) {
    reportRenderFailure(this.props.scope, error);
  }
  private retry = () => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }));
  render() {
    if (this.state.error) return this.props.fallback?.(this.retry) ?? <SectionFailure onRetry={this.retry} />;
    return <Attempt key={this.state.attempt}>{this.props.children}</Attempt>;
  }
}

/** Keyed by the retry count so Try again remounts the failed block. */
function Attempt({ children }: PropsWithChildren) {
  return <>{children}</>;
}
