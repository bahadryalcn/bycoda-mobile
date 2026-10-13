/** Public transport surface. Keep native pairing, validation and retry policy separate. */
export { HostTransport } from "./host-transport";
export { RemoteHostError } from "./host-error";
export { normalizeHostEndpoint, requireMobileHostDescriptor } from "./transport-validation";
export { discoverMachine } from "./pairing";
