import Convert from "ansi-to-html";
import styles from "./code.module.css";

/**
 * DMOJ's `ansi2html` filter over compiler output.
 *
 * The palette is MOJ's tokens rather than the library's default hexes, so a
 * compiler's red really is `--v-bad` and the block reads in both themes;
 * `escapeXML` keeps the compiler's own text out of the markup.
 */
const convert = new Convert({
  fg: "var(--ink)",
  bg: "transparent",
  newline: false,
  escapeXML: true,
  colors: {
    0: "var(--ink)",
    1: "var(--v-bad)",
    2: "var(--v-good)",
    3: "var(--v-warn)",
    4: "var(--brand-royal)",
    5: "var(--rating-candidate-master)",
    6: "var(--brand-cyan)",
    7: "var(--ink-2)",
    8: "var(--muted)",
    9: "var(--v-bad)",
    10: "var(--v-good)",
    11: "var(--v-warn)",
    12: "var(--brand-royal)",
    13: "var(--rating-candidate-master)",
    14: "var(--brand-cyan)",
    15: "var(--ink)",
  },
});

export function AnsiBlock({ text }: { text: string }) {
  return (
    <pre
      className={styles.ansi}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ansi-to-html escapes the source text
      dangerouslySetInnerHTML={{ __html: convert.toHtml(text) }}
    />
  );
}
