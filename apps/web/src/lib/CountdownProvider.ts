"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type CountdownClock = { now: number; subscribe: () => () => void };

const CountdownClockContext = createContext<CountdownClock | null>(null);

/**
 * Gives every countdown the request timestamp that produced the server markup.
 * The serialized value is reused for hydration, then becomes a live clock once
 * effects run in the browser. It only ticks while a countdown is mounted, so a
 * page without one runs no timer at all.
 */
export function CountdownProvider({ initialNow, children }: { initialNow: number; children?: ReactNode }) {
  const [now, setNow] = useState(initialNow);
  const [subscribers, setSubscribers] = useState(0);
  const ticking = subscribers > 0;

  useEffect(() => {
    if (!ticking) return;

    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [ticking]);

  const subscribe = useCallback(() => {
    setSubscribers((count) => count + 1);

    return () => setSubscribers((count) => count - 1);
  }, []);

  const clock = useMemo(() => ({ now, subscribe }), [now, subscribe]);

  return createElement(CountdownClockContext.Provider, { value: clock }, children);
}

/** The shared second clock. Mounting a reader is what starts it ticking. */
export function useCountdownNow(): number | null {
  const clock = useContext(CountdownClockContext);
  const subscribe = clock?.subscribe;

  useEffect(() => subscribe?.(), [subscribe]);

  return clock?.now ?? null;
}
