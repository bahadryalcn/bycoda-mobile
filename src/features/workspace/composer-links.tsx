import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import Link from "lucide-react-native/icons/link";
import { Body, ErrorText, PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import type { ComposerLink } from "./attachment-presentation";

/** Link chips for URLs in the draft: host and path, like the desktop composer's link previews. */
export function ComposerLinks({ links }: { links: readonly ComposerLink[] }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}>
        {links.map((link) => (
          <PressableCard
            key={link.href}
            label={copy("Bağlantıyı aç: {p0}", "Open link: {p0}", { p0: link.href })}
            onPress={() => { setError(null); void Linking.openURL(link.href).catch(setError); }}
            style={{
              maxWidth: 240, minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm,
              padding: space.sm, backgroundColor: colors.raised, borderWidth: 0, borderRadius: radii.control,
            }}
          >
            <Link size={16} color={colors.accent} />
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Body numberOfLines={1} style={uiStyles.caption}>{link.host}</Body>
              {link.path ? <Body muted numberOfLines={1} ellipsizeMode="middle" style={uiStyles.caption}>{link.path}</Body> : null}
            </View>
          </PressableCard>
        ))}
      </ScrollView>
      {error ? <ErrorText error={error} /> : null}
    </>
  );
}
