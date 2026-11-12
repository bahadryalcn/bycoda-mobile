import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { View } from "react-native";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { Body, Button, IconButton, QueryState, Row } from "@/ui/primitives";
import { space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useDiffPreview } from "./use-diff-preview";
import { useGitDiff } from "./git-queries";
import type { GitDiffPanelProps } from "./git-types";
import { GitDiffViewer } from "./git-diff-viewer";
import { GitSelective } from "./git-selective";

export function GitDiffPanel({
  scope,
  selection,
  busy,
  onBack,
  onOpenFile,
  onStage,
  onDiscard,
  onReviewBusy,
  onReviewExit,
  children,
}: GitDiffPanelProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const diff = useGitDiff(scope, selection);
  const [selecting, setSelecting] = useState(false);
  const textDiff = diff.data && !diff.data.binary && !diff.data.tooLarge ? diff.data : undefined;
  const preview = useDiffPreview(textDiff?.original, textDiff?.current);
  return (
      <View style={uiStyles.stack}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconButton
            label={copy("Değişikliklere dön", "Back to changes")}
            onPress={onBack}
            disabled={busy}
          >
            <ArrowLeft size={18} color={colors.muted} />
          </IconButton>
          <Body
            mono
            selectable={false}
            numberOfLines={2}
            ellipsizeMode="middle"
            style={[uiStyles.grow, { fontSize: fontSize.caption, lineHeight: lineHeight.small }]}
          >
            {selection.path}
          </Body>
        </View>
        <Row style={{ gap: space.sm }}>
          <Button
            label={copy("Dosyayı aç", "Open file")}
            disabled={busy}
            density="compact"
            onPress={() => onOpenFile(selection.path)}
          />
          <Button
            label={
              selection.staged
                ? copy("Stage’den çıkar", "Unstage file")
                : copy("Stage’e al", "Stage file")
            }
            density="compact"
            busy={busy}
            onPress={() => onStage(selection)}
          />
        </Row>
        {!selection.staged && diff.data && preview && !diff.data.binary && !diff.data.tooLarge && !preview.tooLarge && !preview.truncated && !preview.unchanged ? <Button tone="quiet" label={copy("Değişiklikleri seç", "Select changes")} disabled={busy} onPress={() => setSelecting(true)} /> : null}
        <QueryState query={diff} />
        {textDiff && !preview ? <Body muted>{copy("Diff hesaplanıyor…", "Computing diff…")}</Body> : null}
        {!diff.data ? null : diff.data.binary || diff.data.tooLarge || preview?.tooLarge ? (
          <Body muted>
            {copy(
              "İkili veya diff için çok büyük dosya. Tam içeriği bilgisayarda aç.",
              "Binary file or diff exceeds the mobile budget. Open the full content on your computer.",
            )}
          </Body>
        ) : preview?.unchanged ? (
          <Body muted>{copy("İçerikte değişiklik yok.", "No content changes.")}</Body>
        ) : (
          <View style={{ gap: space.sm }}>
            <GitDiffViewer
              key={`${selection.path}:${selection.staged}`}
              lines={preview?.lines ?? []}
            />
            {preview?.truncated ? (
              <Body muted>
                {copy(
                  "İlk 4.000 diff satırı gösteriliyor. Dosyanın tamamı stage işleminde korunur.",
                  "Showing the first 4,000 diff lines. Staging preserves the complete file.",
                )}
              </Body>
            ) : null}
          </View>
        )}
        {!selection.staged ? (
          <Button
            label={copy("Değişiklikleri geri al", "Discard changes")}
            disabled={busy}
            tone="danger"
            density="compact"
            style={{ alignSelf: "flex-start" }}
            onPress={() => onDiscard(selection.path)}
          />
        ) : null}
        {children}
        <GitSelective key={`${scope.projectId}:${scope.cwd}:${scope.root}:${selection.path}`} scope={scope} path={selection.path} visible={selecting} busy={busy} onBusyChange={onReviewBusy ?? (() => {})} onClose={() => setSelecting(false)} onChanged={() => { void diff.refetch(); }} registerExit={onReviewExit} />
      </View>
  );
}
