import { identifier } from "../shared/format";
export const socialRequest = (action: string, input: Record<string, unknown> = {}) => ({
  action,
  input,
  requestId: identifier(),
});
