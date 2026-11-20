import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import Link from "lucide-react-native/icons/link";
import { Chip } from "panelui-native/components/chip";
import { Body, ErrorText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { ComposerLink } from "./attachment-presentation";
import { isLoopbackWebUrl, useLoopbackLink } from "@/ui/loopback-link";

/** Link chips for URLs in the draft: host and path, like the desktop composer's link previews. */
export function ComposerLinks({ links, ownerScope }: { links: readonly ComposerLink[]; ownerScope?: string }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const loopback = useLoopbackLink();
  const [error, setError] = useState<unknown>(null);
  // A loopback address is the computer's own service: only this session's browser opens it, never the phone.
  const openLink = (href: string) => {
    setError(null);
    if (!isLoopbackWebUrl(href)) {
      void Linking.openURL(href).catch(setError);
      return;
    }
    if (loopback && (ownerScope === undefined || ownerScope === loopback.scope)) loopback.open(href);
    else setError(copy(...RECORD_ACCESS_UNAVAILABLE));
  };
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
            onPress={() => openLink(link.href)}
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
