import type { PropsWithChildren } from "react";
import ListFilter from "lucide-react-native/icons/list-filter";
import { Button } from "./buttons";
import { Badge } from "./feedback";
import { Row } from "./layout";
import { Sheet } from "./dialogs";
import { useCopy } from "./copy";
import { colors } from "./tokens";
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
export function FilterSheet({ visible, onClose, onApply, onReset, children }: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}>) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Filtreler", "Filters")} size="compact" onClose={onClose}
      footer={<Row style={{ justifyContent: "space-between" }}>
        <Button label={copy("Sıfırla", "Reset")} tone="quiet" onPress={onReset} />
        <Button label={copy("Uygula", "Apply")} tone="primary" onPress={onApply} />
      </Row>}>
      {children}
    </Sheet>
  );
}
