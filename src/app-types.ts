import type { PropsWithChildren } from "react";
import type { QueryClient } from "@tanstack/react-query";

export type LifecycleProps = PropsWithChildren<{ cache: QueryClient }>;
