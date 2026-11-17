import { View } from "react-native";
import { useState } from "react";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { Badge, Body, Button, Row, SectionHeader, Sheet, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { providerStateLabel, providerStateTone } from "./provider-labels";
import type { PrReviewContext, PrReviewLine } from "./provider-review-model";
import { isTestFile } from "../pull-requests/model/list";

const shortHead = (commitId: string) => commitId.slice(0, 7);

/** Title, state and totals first; the changed-file list stays one tap away. */
export function PrReviewSummary({ item, context, hideTests = false, onSelectFile }: { item: RemoteInboxItem; context?: PrReviewContext; hideTests?: boolean; onSelectFile?: (path: string) => void }) {
  const copy = useCopy();
  const locale = useLocale();
  const numbers = new Intl.NumberFormat(locale);
  const { semanticColors } = useMobileTheme();
  const [filesOpen, setFilesOpen] = useState(false);
  return (
    <Stack>
      <Stack style={{ gap: space.xs }}>
        <Body style={{ fontWeight: "700" }}>{item.title}</Body>
        <Row>
          <Badge label={providerStateLabel(item.state, copy)} tone={providerStateTone(item.state)} />
          {item.draft ? <Badge label={copy("Taslak", "Draft")} /> : null}
          {context ? <Badge label={`${shortHead(context.commitId)}`} /> : null}
        </Row>
        <Body muted>{`${item.repo || item.projectPath} #${item.number}`}</Body>
      </Stack>
      {context ? <>
        <SectionHeader flush title={copy("Değişen dosyalar", "Files changed")} count={context.files.length} />
        <Row>
          <Body style={{ color: semanticColors.success.text }}>{`+${numbers.format(context.additions)}`}</Body>
          <Body style={{ color: semanticColors.danger.text }}>{`−${numbers.format(context.deletions)}`}</Body>
        </Row>
        {context.files.length ? <Button tone="quiet" label={copy("Dosyaları göster", "Show files")} onPress={() => setFilesOpen(true)} /> : null}
        {filesOpen ? <Sheet visible size="full" scroll={false} title={copy("Değişen dosyalar", "Files changed")} onClose={() => setFilesOpen(false)}>
          <ScreenList data={context.files.filter(file => !hideTests || !isTestFile(file.path))} keyExtractor={file => file.path} renderItem={({item: file}) => (
              <View style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, alignItems: "flex-start" }}>
                {onSelectFile ? <Button tone="quiet" label={file.path} onPress={() => { onSelectFile(file.path); setFilesOpen(false); }} /> : <Body mono style={{ flexShrink: 1, flexGrow: 1 }}>{file.path}</Body>}
                <Body style={{ color: semanticColors.success.text }}>{`+${numbers.format(file.additions)}`}</Body>
                <Body style={{ color: semanticColors.danger.text }}>{`−${numbers.format(file.deletions)}`}</Body>
              </View>
            )} />
        </Sheet> : null}
        <SectionHeader flush title={copy("İnceleme", "Review")} />
      </> : null}
    </Stack>
  );
}

/** One diff line, tinted by what changed so additions and removals read at a glance. */
export function PrDiffLine({ line }: { line: Pick<PrReviewLine, "kind" | "text"> }) {
  const { semanticColors } = useMobileTheme();
  const tint = line.kind === "add" ? semanticColors.success : line.kind === "remove" ? semanticColors.danger : undefined;
  return (
    <View style={[{ borderRadius: radii.control, paddingHorizontal: space.xs },
      tint && { backgroundColor: tint.surface }]}>
      <Body mono style={tint && { color: tint.text }}>
        {`${line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}${line.text}`}
      </Body>
    </View>
  );
}
