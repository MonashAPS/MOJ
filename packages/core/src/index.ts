/**
 * `@moj/core`: MOJ's pure domain logic.
 *
 * No I/O, no Convex, no React. Everything takes plain rows shaped like the
 * tables in docs/SPEC.md section 4 and returns plain data. The rules are ports
 * of DMOJ's, documented function by function in docs/DMOJ_RULES.md.
 */

export * from './types';
export * from './permissions';
export * from './contestTiming';
export * from './verdicts';
export * from './formats/index';
export * from './ratings';
export * from './points';
export * from './judging';
export * from './scoreboard';
export { floatformat, niceRepr, pyRound, roundHalfUp } from './util/number';
