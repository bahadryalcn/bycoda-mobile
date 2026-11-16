import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import Link from "lucide-react-native/icons/link";
import { Chip } from "panelui-native/components/chip";
import { Body, ErrorText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { ComposerLink } from "./attachment-presentation";

/** Link chips for URLs in the draft: host and path, like the desktop composer's link previews. */
export function ComposerLinks({ links }: { links: readonly ComposerLink[] }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        // A horizontal scroller inside a message must not grow into the virtual cell's estimate.
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}>
        {links.map((link) => (
          <Chip
            key={link.href}
            variant="outline"
            className="h-12 max-w-60 self-auto"
            accessibilityLabel={copy("Bağlantıyı aç: {p0}", "Open link: {p0}", { p0: link.href })}
            start={<Link size={16} color={colors.accent} />}
            onPress={() => { setError(null); void Linking.openURL(link.href).catch(setError); }}
          >
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Body numberOfLines={1} style={uiStyles.caption}>{link.host}</Body>
              {link.path ? <Body muted numberOfLines={1} ellipsizeMode="middle" style={uiStyles.caption}>{link.path}</Body> : null}
            </View>
          </Chip>
        ))}
      </ScrollView>
      {error ? <ErrorText error={error} /> : null}
    </>
  );
}
