import { createContext } from "react";
/** A surrounding action scroller owns feedback and controls as one region. */
export const FormActionScrollOwner = createContext(false);
/** True while the surrounding action control already shows progress; feedback must not repeat it. */
export const FormActionBusy = createContext(false);
