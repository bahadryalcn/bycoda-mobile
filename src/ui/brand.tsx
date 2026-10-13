import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCopy } from "./copy";
import { colors, fontSize, metrics, opacity, space } from "./tokens";

const logo = require("../../../public/brand/bycoda/logo-horizontal-white.png");

export type LegalLinkTarget = "privacy" | "terms" | "help";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      source={logo}
      contentFit="contain"
      contentPosition="left"
      accessible
      accessibilityLabel="bycoda"
      style={[styles.logo, compact && styles.compactLogo]}
    />
  );
}

export const Brand = BrandLogo;

/** Receives navigation so the same links also work before the router is mounted. */
export function LegalLinks({ onOpen }: { onOpen: (document: LegalLinkTarget) => void }) {
  const copy = useCopy();
  const links: { document: LegalLinkTarget; label: string }[] = [
    { document: "privacy", label: copy("Gizlilik", "Privacy") },
    { document: "terms", label: copy("Kullanım koşulları", "Terms of use") },
    { document: "help", label: copy("Yardım", "Help") },
  ];
  return (
    <View style={styles.links}>
      {links.map(({ document, label }) => (
        <Pressable
          key={document}
          accessibilityRole="link"
          accessibilityLabel={label}
          onPress={() => onOpen(document)}
          style={({ pressed }) => [styles.link, { opacity: pressed ? opacity.pressed : 1 }]}
        >
          <Text style={styles.linkLabel}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: "100%", maxWidth: 254, aspectRatio: 390 / 80 },
  compactLogo: { maxWidth: 152 },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  link: {
    minHeight: metrics.controlHeight,
    maxWidth: "100%",
    justifyContent: "center",
    paddingVertical: space.sm,
  },
  linkLabel: {
    color: colors.muted,
    fontSize: fontSize.small,
    lineHeight: 20,
    textDecorationLine: "underline",
  },
});
