import type { PropsWithChildren } from "react";
import ListFilter from "lucide-react-native/icons/list-filter";
import { Button } from "./buttons";
import { Badge } from "./feedback";
import { Row } from "./layout";
import { Sheet } from "./dialogs";
import { useCopy } from "./copy";
import { colors } from "./tokens";
import { Body } from "./typography";
import { uiStyles } from "./styles";
import { useMobileTheme } from "./theme";

export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  return (
    <Button label={copy("Filtreler", "Filters")} accessibilityLabel={count ? `${copy("Filtreler", "Filters")} · ${count}` : undefined}
      tone={count ? "secondary" : "quiet"} onPress={onPress}>
      <ListFilter size={18} color={colors.accent} />
      {count ? <Badge label={String(count)} /> : null}
    </Button>
  );
}

/** Filter edits stay local until Apply; the action area never scrolls away. */
export function FilterSheet({ visible, onClose, onApply, onReset, applyDisabled = false, children }: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  applyDisabled?: boolean;
}>) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Filtreler", "Filters")} size="compact" onClose={onClose}
      footer={<Row style={{ justifyContent: "space-between" }}>
        <Button label={copy("Sıfırla", "Reset")} tone="quiet" onPress={onReset} />
        <Button label={copy("Uygula", "Apply")} tone="primary" disabled={applyDisabled} onPress={onApply} />
      </Row>}>
      {children}
    </Sheet>
  );
}

/** Applied state only: staged choices stay inside the filter editor until Apply. */
export function AppliedFilters({ filters, result }: {
  filters: readonly (string | false | null | undefined)[];
  result?: string;
}) {
  useMobileTheme();
  const copy = useCopy();
  const labels = filters.filter((label): label is string => typeof label === "string" && !!label);
  const text = [result, ...labels].filter(Boolean).join(" · ");
  const spoken = [result, labels.length ? `${copy("Filtreler", "Filters")}: ${labels.join(" · ")}` : null].filter(Boolean).join(" · ");
  return text ? <Body muted accessibilityLabel={spoken} style={uiStyles.caption}>{text}</Body> : null;
}
