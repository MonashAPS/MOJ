/**
 * `@moj/core`: MOJ's pure domain logic.
 *
 * No I/O, no Convex, no React. Everything takes plain rows shaped like the
 * tables in docs/SPEC.md section 4 and returns plain data. The rules are ports
 * of DMOJ's, documented function by function in docs/DMOJ_RULES.md.
 */

export * from './types.js';
export * from './permissions.js';
export * from './contestTiming.js';
export * from './verdicts.js';
export * from './formats/index.js';
export * from './ratings.js';
export * from './points.js';
export * from './judging.js';
export * from './scoreboard.js';
export { floatformat, niceRepr, pyRound, roundHalfUp } from './util/number.js';
