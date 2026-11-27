import { createContext, use } from "react";

/** True inside a NavigationGroup, so row-like controls can adopt list padding. */
export const GroupedNavigation = createContext(false);
/** True inside a NavigationGroup, so row-like controls can adopt list padding. */
export const useInNavigationGroup = () => use(GroupedNavigation);
