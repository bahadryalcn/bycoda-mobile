import Constants from "expo-constants";
import { createFirebaseReportSender } from "./report-delivery";

const configuration = Constants.expoConfig?.extra?.reporting;
// Null until the owner's Firebase receiver is deployed and verified.
export const reportSender = configuration?.provider === "firebase"
  ? createFirebaseReportSender(configuration.endpoint)
  : null;
