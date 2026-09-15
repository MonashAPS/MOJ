/**
 * The `olympics` scoreboard theme's sport pictograms.
 *
 * Ported from the DMOJ fork's `templates/contest/scoreboard-themes/olympics.html`,
 * whose Jinja `sports` and `problem_icons` tables become the two maps below. The
 * artwork is the fork's, copied to `public/scoreboard-themes/olympics/`.
 *
 * The colour is the accent already inside each SVG — the disc the figure sits
 * on — repeated here because CSS cannot read it back out of the file. Change one
 * and change the other, or a header will not match its own icon.
 */

export const SPORT_COLOURS = new Map<string, string>([
  ["archery", "#8338EC"],
  ["artistic-gymnastics", "#ED3939"],
  ["athletics", "#3A86FF"],
  ["bouldering", "#FFBE0B"],
  ["cycling", "#46B2D9"],
  ["fencing", "#4AFA44"],
  ["golf", "#A8ED39"],
  ["pentathlon", "#39BD5C"],
  ["rhythmic-gymnastics", "#E139ED"],
  ["sailing", "#FF006E"],
  ["skateboarding", "#FB5607"],
]);

/** The order the fallback below walks, which is the order the files are named. */
const SPORTS = [...SPORT_COLOURS.keys()];

/**
 * Which sport each problem wears, per division.
 *
 * Keyed on the contest key and the problem's *code*, not its position, so a
 * mapping survives the contest being reordered. The fork's own table is carried
 * over as it stands; add a division here when you dress one up.
 */
export const PROBLEM_SPORTS = new Map<string, Map<string, string>>([
  [
    "diva",
    new Map([
      ["slicktricks", "skateboarding"],
      ["polyathlon", "pentathlon"],
      ["golfroyale", "golf"],
      ["effortless", "rhythmic-gymnastics"],
      ["cyclingpreshow", "cycling"],
      ["polevaultexpress", "athletics"],
      ["fencingshortcuts", "fencing"],
      ["crossingsails", "sailing"],
      ["boulderingwall", "bouldering"],
      ["balancebeamlanding", "artistic-gymnastics"],
      ["archerybannerstrips", "archery"],
    ]),
  ],
]);

export type Pictogram = { sport: string; src: string; colour: string };

/**
 * The pictogram for one problem column.
 *
 * A division the table does not name falls back to the sport at that column's
 * position, so every column carries a pictogram (DESIGN.md section 16.2) rather
 * than a row of gaps. The explicit table always wins, so a division that has been
 * dressed reads exactly as it was written.
 */
export function pictogramFor(divisionKey: string, code: string, index: number): Pictogram | null {
  const named = PROBLEM_SPORTS.get(divisionKey)?.get(code);
  const sport = named ?? SPORTS[index % SPORTS.length];

  if (!sport) return null;
  const colour = SPORT_COLOURS.get(sport);

  if (!colour) return null;

  return { sport, src: `/scoreboard-themes/olympics/problems/${sport}.svg`, colour };
}
