/**
 * `remarkSpoiler` hides text written between `||` markers until the reader asks
 * for it, the way Discord and Reddit spell a spoiler.
 *
 * An editorial is the reason it exists: a solution wants to give a hint, then a
 * lemma, then the answer, without the reader's eye arriving at the answer first.
 *
 * This is a tree transform rather than a micromark construct, unlike
 * `remarkTildeMath`. A spoiler's content is ordinary markdown — `||the answer is
 * **7**||` emboldens the seven — and a construct that tokenised the run itself
 * would have to hand the inside back to the text tokeniser to get that. Pairing
 * markers over a parent's children afterwards keeps the inside untouched: it is
 * already parsed.
 *
 * What that costs is that a marker only pairs with one in the same parent, so a
 * spoiler cannot span two paragraphs or reach out of a list item. Markers inside
 * code spans, code blocks, maths and raw HTML are not text nodes at all, so they
 * are left alone, which is what `||` in a C++ condition needs.
 */

import type { Data, Nodes, Parents, PhrasingContent, Root } from "mdast";
import type { Plugin } from "unified";

declare module "mdast" {
  interface PhrasingContentMap {
    spoiler: Spoiler;
  }

  interface RootContentMap {
    spoiler: Spoiler;
  }
}

interface Spoiler {
  type: "spoiler";
  children: PhrasingContent[];
  data?: Data;
}

const MARKER = "||";

/**
 * `tabIndex` is what makes the reveal work without JavaScript: a span nothing
 * can focus is a span a touch cannot open, and hover is not a gesture a phone
 * has. `content.css` reveals on `:hover` and `:focus` alike.
 */
function spoiler(children: PhrasingContent[]): Spoiler {
  return {
    type: "spoiler",
    children,
    data: { hName: "span", hProperties: { className: ["spoiler"], tabIndex: 0 } },
  };
}

/** A marker, or a child that was already parsed and only needs placing. */
type Piece = { readonly marker: true } | { readonly marker: false; readonly node: PhrasingContent };

/** Splits the text children on `||`, leaving every other child whole. */
function toPieces(children: readonly PhrasingContent[]): Piece[] {
  const pieces: Piece[] = [];

  for (const child of children) {
    if (child.type !== "text" || !child.value.includes(MARKER)) {
      pieces.push({ marker: false, node: child });

      continue;
    }

    const parts = child.value.split(MARKER);

    for (const [index, part] of parts.entries()) {
      if (index > 0) pieces.push({ marker: true });

      if (part) pieces.push({ marker: false, node: { type: "text", value: part } });
    }
  }

  return pieces;
}

/** A marker that never found a partner is the two characters it was written as. */
function literal(): PhrasingContent {
  return { type: "text", value: MARKER };
}

/**
 * Pairs the markers off, first opener with the next closer. `||a ||b|| c||`
 * therefore hides `a ` and ` c` and leaves `b` in the open, which is what every
 * other renderer that spells spoilers this way does.
 */
function pair(pieces: readonly Piece[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  /** Where in `out` the open marker sits, or -1 while none is open. */
  let openAt = -1;

  for (const piece of pieces) {
    if (!piece.marker) {
      out.push(piece.node);

      continue;
    }

    if (openAt === -1) {
      openAt = out.length;
      out.push(literal());

      continue;
    }

    const inside = out.slice(openAt + 1);

    // `||||` hides nothing, so it stays the four characters it was written as.
    if (inside.length === 0) {
      out.push(literal());
      openAt = -1;

      continue;
    }

    out.length = openAt;
    out.push(spoiler(inside));
    openAt = -1;
  }

  return out;
}

function hasChildren(node: Nodes): node is Parents {
  return "children" in node;
}

/**
 * The nodes whose children are all phrasing content. Markers pair inside these
 * and nowhere else: a `||` in one list item and a `||` in the next are two list
 * items, not a spoiler wrapped around the bullet between them.
 */
const PHRASING_PARENTS = new Set<Nodes["type"]>([
  "paragraph",
  "heading",
  "tableCell",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "spoiler",
]);

function walk(node: Nodes): void {
  if (!hasChildren(node)) return;

  for (const child of node.children) walk(child);

  if (!PHRASING_PARENTS.has(node.type)) return;
  // SAFETY: every type in PHRASING_PARENTS takes phrasing content and nothing
  // else, which is what mdast's own definitions of them say.
  const children = node.children as PhrasingContent[];

  if (!children.some((child) => child.type === "text" && child.value.includes(MARKER))) return;
  // SAFETY: the children going back are the ones that came out, re-ordered, plus
  // spoilers, which are phrasing content too.
  node.children = pair(toPieces(children)) as typeof node.children;
}

const remarkSpoiler: Plugin<[], Root> = function remarkSpoiler() {
  return (tree: Root): void => {
    walk(tree);
  };
};

export default remarkSpoiler;
