/** The house curves, exported once so a component can never improvise a bezier.
 *  The CSS mirrors live in tokens.css as `--ease*`; these are the framer-motion
 *  array literals.  */

export const EASE = [0.22, 1, 0.36, 1] as const; // easeOutQuint — entrances, hovers
export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // easeOutExpo — cross-fades, routes
export const EASE_IN = [0.4, 0, 1, 1] as const; // anything leaving
export const EASE_CURTAIN = [0.76, 0, 0.24, 1] as const; // symmetric, overlays only
export const EASE_SMOOTH = [0.4, 0, 0.2, 1] as const; // micro state changes

export const DUR_FAST = 0.12;
export const DUR = 0.3;
export const DUR_SLOW = 0.5;
export const DUR_CURTAIN = 0.62;

/** Stagger is capped, never linear: the fifth row must not wait two seconds. */
export function stagger(index: number, step = 40, cap = 300): number {
  return Math.min(index * step, cap) / 1000;
}
