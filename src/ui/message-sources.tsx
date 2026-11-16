import { useState } from "react";
import { View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import LinkIcon from "lucide-react-native/icons/link";
import { Sources } from "panelui-native/components/sources";
import type { LinkOnlyItem } from "./message-link-item";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { fontSize, lineHeight, space } from "./tokens";

/**
 * One web link as a PanelUI source row: title, then host. The owner opens it, so a failed
 * open reaches the message's own error line instead of PanelUI's silent catch.
 */
export function MessageSource({ item, onOpen }: { item: LinkOnlyItem; onOpen: (href: string) => void }) {
  const { colors } = useMobileTheme();
  return (
    <Sources.Source
      accessibilityLabel={`${item.title}, ${item.host}`}
      onPress={() => onOpen(item.href)}
      className="min-h-12"
    >
      <LinkIcon size={14} color={colors.muted} />
      <Body numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: fontSize.control, lineHeight: lineHeight.control, color: colors.accent }}>
        {item.title}
      </Body>
      {item.title !== item.host ? (
        <Body numberOfLines={1} muted style={{ flexShrink: 1, maxWidth: "40%", fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
          {item.host}
        </Body>
      ) : null}
    </Sources.Source>
  );
}

/**
 * A list made only of web links, as PanelUI Sources folded under its count. The author wrote
 * the list on purpose, so it starts open; the fold lets a long one get out of the way.
 */
export function MessageSources({ items, onOpen }: { items: readonly LinkOnlyItem[]; onOpen: (href: string) => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(true);
  const label = copy("{p0} kaynak", "{p0} sources", { p0: items.length });
  return (
    <Sources open={open} onOpenChange={setOpen}>
      <Sources.Trigger accessibilityLabel={label} className="min-h-12">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Body style={{ fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "500", color: colors.muted }}>
            {label}
          </Body>
          <ChevronDown size={16} color={colors.tertiary} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        </View>
      </Sources.Trigger>
      <Sources.Content>
        {items.map((item, index) => (
          <MessageSource key={`${index}:${item.href}`} item={item} onOpen={onOpen} />
        ))}
      </Sources.Content>
    </Sources>
  );
}
