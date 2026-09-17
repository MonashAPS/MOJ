/**
 * A balloon colour for a contest problem.
 *
 * Every DOMjudge problem carries a balloon colour, and its problem list is read
 * by that colour before it is read by the letter. We store no such field, so
 * the colour is derived from the problem's code: the same problem is the same
 * colour on every page and every reload, different problems in a contest are
 * spread around the wheel, and nobody has to fill anything in.
 *
 * The hues avoid the 60-90 band, where a light fill goes muddy against dark
 * text, and the lightness is fixed high enough that the letter inside stays
 * legible without a second colour to compute.
 */

/** FNV-1a, for a stable spread that does not depend on string length. */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

export type Balloon = { hue: number; fill: string; line: string };

export function balloonFor(code: string): Balloon {
  // 24 stops rather than 360: two problems in one contest should look plainly
  // different, not a shade apart.
  const stop = hashOf(code) % 24;
  const hue = (stop * 15 + 15) % 360;

  return {
    hue,
    fill: `hsl(${hue} 70% 72%)`,
    line: `hsl(${hue} 55% 42%)`,
  };
}
