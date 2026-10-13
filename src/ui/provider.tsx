import { type PropsWithChildren } from "react";
import { GluestackUIProvider } from "./gluestack/gluestack-ui-provider";
import { colors } from "./tokens";

/** The application owns one theme and mounts its UI providers inside the security gate. */
export function BycodaUIProvider({ children }: PropsWithChildren) {
  return (
    <GluestackUIProvider mode="dark" style={{ backgroundColor: colors.background }}>
      {children}
    </GluestackUIProvider>
  );
}
