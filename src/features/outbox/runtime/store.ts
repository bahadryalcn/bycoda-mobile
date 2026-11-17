import AsyncStorage from "@react-native-async-storage/async-storage";
import { SendOutbox } from "../model/outbox";
export const sendOutbox = new SendOutbox(AsyncStorage);
