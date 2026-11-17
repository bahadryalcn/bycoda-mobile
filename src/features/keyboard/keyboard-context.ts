import { createContext, useContext } from "react";

export const KeyboardContext = createContext({ visible: false, open() {}, close() {} });
export const useCommandPalette = () => useContext(KeyboardContext);
