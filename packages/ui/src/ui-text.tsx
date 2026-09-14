"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * The handful of strings the components speak for themselves.
 *
 * These are screen-reader labels on generic chrome, in the components that run
 * only on the client: a dialog's close button, a spinner. They have no call site
 * to take a prop from, and there are enough consumers that threading a prop
 * through all of them would be worse than this.
 *
 * A component that also renders on the server cannot read this, because context
 * is a client-side thing. Those take their label as a prop instead, as PageTabs
 * and PaginationRoot do.
 *
 * The package stays independent of the app's translation library: it holds
 * English, and an application that has a catalogue fills these in once at its
 * root. Nothing here is a sentence, so nothing here needs interpolation.
 */
export type UiText = {
  close: string;
  loading: string;
};

const ENGLISH: UiText = {
  close: "Close",
  loading: "Loading",
};

const UiTextContext = createContext<UiText>(ENGLISH);

export function UiTextProvider({ value, children }: { value: Partial<UiText>; children: ReactNode }) {
  return <UiTextContext.Provider value={{ ...ENGLISH, ...value }}>{children}</UiTextContext.Provider>;
}

/** English unless an application has provided its own. */
export function useUiText(): UiText {
  return useContext(UiTextContext);
}
