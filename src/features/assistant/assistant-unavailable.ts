import { remoteErrorKind } from "@/ui/error-message";

/** The Host answered but does not offer the assistant: the computer needs a newer bycoda. */
export const assistantNeedsUpdate = (error: unknown) => remoteErrorKind(error) === "unsupported";
