import { createThemedStyles, useThemedStyles } from "./themed-styles";
import { useMobileTheme } from "./theme";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCopy } from "./copy";
import { colors, fontSize, metrics, opacity, space } from "./tokens";

const logo = require("../../../public/brand/bycoda/logo-horizontal-white.png");
const mark = require("../../../public/brand/bycoda/mark-white.png");

export type LegalLinkTarget = "privacy" | "terms" | "help";

export function BrandLogo({ compact = false, centered = false }: { compact?: boolean; centered?: boolean }) {
  const { colors } = useMobileTheme();
  const styles = useThemedStyles(brandStyles);
  return (
    <Image
      source={logo}
      tintColor={colors.brand}
      contentFit="contain"
      contentPosition={centered ? "center" : "left"}
      accessible
      accessibilityLabel="bycoda"
      style={[styles.logo, compact && styles.compactLogo]}
    />
  );
}

export const Brand = BrandLogo;

/** The product mark accompanies the current workspace title without replacing its identity. */
export function BrandTitle({ title }: { title: string }) {
  const { colors, uiStyles } = useMobileTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0, flexShrink: 1 }}>
    <Image source={mark} tintColor={colors.brand} contentFit="contain" accessible={false}
      style={{ width: 24, height: 24, flexShrink: 0 }} />
    <Text accessibilityRole="header" numberOfLines={1} style={[uiStyles.heading, { flexShrink: 1 }]}>{title}</Text>
  </View>;
}

/** Receives navigation so the same links also work before the router is mounted. */
export function LegalLinks({ onOpen }: { onOpen: (document: LegalLinkTarget) => void }) {
  const styles = useThemedStyles(brandStyles);
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

const brandStyles = createThemedStyles(() => ({
  logo: { width: "100%", maxWidth: 254, aspectRatio: 390 / 80 },
  compactLogo: { maxWidth: 152 },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: space.lg,
    paddingTop: space.sm,
  },
  link: {
    minHeight: metrics.controlHeight,
    minWidth: metrics.touchTarget,
    maxWidth: "100%",
    justifyContent: "center",
    paddingVertical: space.sm,
  },
  linkLabel: {
    color: colors.muted,
    fontSize: fontSize.small,
    lineHeight: 20,
  },
}));
