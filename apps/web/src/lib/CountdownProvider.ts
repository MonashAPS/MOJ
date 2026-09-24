"use client";

import { createContext, createElement, type ReactNode, useContext, useEffect, useState } from "react";

const CountdownNowContext = createContext<number | null>(null);

/**
 * Gives every countdown the request timestamp that produced the server markup.
 * The serialized value is reused for hydration, then becomes a live clock once
 * effects are allowed to run in the browser.
 */
export function CountdownProvider({ initialNow, children }: { initialNow: number; children?: ReactNode }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, []);

  return createElement(CountdownNowContext.Provider, { value: now }, children);
}

export function useCountdownNow(): number | null {
  return useContext(CountdownNowContext);
}
