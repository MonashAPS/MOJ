"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_SKIN, SKIN_STORAGE_KEY, type Skin, writeSkinCookie } from "@/lib/skin";

type SkinState = {
  skin: Skin;
  choose: (next: Skin) => void;
};

const SkinContext = createContext<SkinState>({ skin: DEFAULT_SKIN, choose: () => undefined });

/** The skin a component is being rendered in, for the handful of places where a
 *  skin changes behaviour rather than colour. */
export function useSkin(): Skin {
  return useContext(SkinContext).skin;
}

/** The same, plus the way to change it: the theme menu is its only caller. */
export function useSkinChoice(): SkinState {
  return useContext(SkinContext);
}

/** Reads what this browser was last told, or null if it has never been told. */
function storedSkin(): Skin | null {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);

    return stored === "maps" || stored === "domjudge" ? stored : null;
  } catch {
    return null;
  }
}

function applySkin(skin: Skin) {
  document.documentElement.setAttribute("data-skin", skin);
  // The cookie is what the next page load is rendered from, so it goes first:
  // it is the half that still works when storage is unavailable.
  writeSkinCookie(skin);

  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // private mode, nothing to do
  }
}

/**
 * Holds the skin for the React tree.
 *
 * `<html>` already carries it — the server put it there and the pre-paint
 * bootstrap corrected it — so this is not what paints the page. It is what lets
 * a component ask which skin it is in, and what re-renders those components when
 * the viewer picks another one without reloading.
 */
export function SkinProvider({ initial, children }: { initial: Skin; children: ReactNode }) {
  const [skin, setSkin] = useState<Skin>(initial);
  const persist = useMutation(api.profiles.setTheme);

  // What this browser holds beats what the page was rendered with: a page the
  // browser replays from its cache can arrive older than the stored choice.
  useEffect(() => {
    const stored = storedSkin();

    if (!stored || stored === skin) return;
    setSkin(stored);
    applySkin(stored);
    // Only ever a correction on arrival, so the viewer's own click is not
    // fought by a stale read: the choice below writes storage before this runs.
  }, [skin]);

  // A choice made in one tab belongs to the browser, not to that tab.
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== null && event.key !== SKIN_STORAGE_KEY) return;
      const stored = storedSkin();

      if (!stored) return;
      setSkin(stored);
      applySkin(stored);
    }

    window.addEventListener("storage", sync);

    return () => window.removeEventListener("storage", sync);
  }, []);

  const choose = useCallback(
    (next: Skin) => {
      setSkin(next);
      applySkin(next);
      // The profile is how the choice travels to another machine. Anonymous
      // viewers have none, and the browser's own copy stands on its own.
      void persist({ siteSkin: next }).catch(() => undefined);
    },
    [persist],
  );

  return <SkinContext.Provider value={{ skin, choose }}>{children}</SkinContext.Provider>;
}
