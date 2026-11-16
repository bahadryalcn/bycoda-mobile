/**
 * Lazy-loadable `AppState`. A dynamic `import("react-native")` makes Metro evaluate every
 * react-native export, and on iOS the legacy PushNotificationIOS export throws at load time
 * because its native module is absent; importing this module touches only `AppState`.
 */
export { AppState } from "react-native";
