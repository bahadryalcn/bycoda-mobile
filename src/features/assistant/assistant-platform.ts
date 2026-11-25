import { Platform } from "react-native";

/** Picture in picture exists only in the Android voice service; iOS has no such window for a call. */
export const assistantPictureInPictureSupported = () => Platform.OS === "android";
