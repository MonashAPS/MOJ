/**
 * The small DOM rewrites DMOJ applies on top of plain markdown rendering:
 *
 *   - `AwesomeRenderer.table` wraps every table in `.h-scrollable-table` and gives it the
 *     `.table` skin;
 *   - `AwesomeRenderer._link_rel` adds `rel="nofollow"` to links whose host is not in
 *     `NOFOLLOW_EXCLUDED`;
 *   - `judge.jinja2.markdown.lazy_load` defers images (MOJ uses `loading="lazy"` instead of
 *     DMOJ's `blank.gif` placeholder and `unveil` JavaScript);
 *   - `judge.utils.camo.CamoClient.update_tree` proxies remote images;
 *   - `judge.jinja2.reference.reference` expands `[user:name]` and `[ruser:name]`.
 */

import { createHmac } from "node:crypto";
import type { Element, Parent, Root, RootContent, Text } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/* -------------------------------------------------------------------------- tables ----- */

const rehypeScrollableTables: Plugin<[], Root> = function rehypeScrollableTables() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent: Parent | undefined) => {
      if (node.tagName !== "table" || !parent || index === undefined) return;
      if (parent.type === "element" && (parent as Element).tagName === "div") {
        const classes = (parent as Element).properties?.className;
        if (Array.isArray(classes) && classes.includes("h-scrollable-table")) return;
      }
      const classes = node.properties.className;
      const list = Array.isArray(classes) ? classes.map(String) : [];
      if (!list.includes("table")) list.push("table");
      node.properties.className = list;

      const wrapper: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["h-scrollable-table"] },
        children: [node],
      };
      parent.children.splice(index, 1, wrapper);
      return index + 1;
    });
  };
};

const TABLE_CONTAINERS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup"]);

/**
 * Drops the pretty-printing whitespace `mdast-util-to-hast` puts between table rows.
 *
 * It has to go before `rehype-raw`, because parse5 applies the HTML foster-parenting rules and
 * hoists that whitespace out of the table, leaving a run of blank lines in front of it.
 */
const rehypeTidyTables: Plugin<[], Root> = function rehypeTidyTables() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!TABLE_CONTAINERS.has(node.tagName)) return;
      node.children = node.children.filter((child) => !(child.type === "text" && child.value.trim() === ""));
    });
  };
};

/* --------------------------------------------------------------------------- links ----- */

export interface NofollowOptions {
  /** Hosts that keep their links unannotated, DMOJ's `NOFOLLOW_EXCLUDED`. */
  readonly excluded?: readonly string[];
}

function hostOf(href: string): string | null {
  try {
    // A base is needed for relative URLs; those have no host and are left alone.
    return new URL(href, "moj-relative:/").host || null;
  } catch {
    return null;
  }
}

const rehypeNofollow: Plugin<[NofollowOptions], Root> = function rehypeNofollow(options) {
  const excluded = new Set((options.excluded ?? []).map((host) => host.toLowerCase()));
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || !href) return;
      const host = hostOf(href);
      if (!host || excluded.has(host.toLowerCase())) return;
      const rel: unknown = node.properties.rel;
      const list = Array.isArray(rel)
        ? rel.map(String)
        : typeof rel === "string"
          ? rel.split(/\s+/).filter(Boolean)
          : [];
      if (!list.includes("nofollow")) list.push("nofollow");
      node.properties.rel = list;
    });
  };
};

/* -------------------------------------------------------------------------- images ----- */

const rehypeLazyImages: Plugin<[], Root> = function rehypeLazyImages() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      // DMOJ's lazy_load skips data URIs and rendered maths images.
      if (typeof src === "string" && src.startsWith("data")) return;
      const classes = node.properties?.className;
      const list = Array.isArray(classes) ? classes.map(String) : [];
      if (list.some((name) => name.includes("-math"))) return;
      node.properties.loading = "lazy";
      node.properties.decoding = "async";
    });
  };
};

/* ---------------------------------------------------------------------------- camo ----- */

export interface CamoOptions {
  readonly server: string;
  readonly key: string;
  readonly https?: boolean;
  readonly excluded?: readonly string[];
}

/** `judge.utils.camo.CamoClient.image_url`. */
export function camoUrl(options: CamoOptions, url: string): string {
  const server = options.server.replace(/\/+$/, "");
  const digest = createHmac("sha1", options.key).update(url, "utf8").digest("hex");
  return `${server}/${digest}/${Buffer.from(url, "utf8").toString("hex")}`;
}

export function camoRewrite(options: CamoOptions, url: string): string {
  const server = options.server.replace(/\/+$/, "");
  if (url.startsWith(server)) return url;
  if ((options.excluded ?? []).some((prefix) => url.startsWith(prefix))) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return camoUrl(options, url);
  if (url.startsWith("//")) {
    return camoRewrite(options, `${options.https ? "https:" : "http:"}${url}`);
  }
  return url;
}

const rehypeCamo: Plugin<[CamoOptions], Root> = function rehypeCamo(options) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img") {
        for (const attribute of ["src", "dataSrc"]) {
          const value = node.properties?.[attribute];
          if (typeof value === "string" && value) {
            node.properties[attribute] = camoRewrite(options, value);
          }
        }
      } else if (node.tagName === "object") {
        const value = node.properties?.data;
        if (typeof value === "string" && value) {
          node.properties.data = camoRewrite(options, value);
        }
      }
    });
  };
};

/* ----------------------------------------------------------------- user references ----- */

export interface UserReference {
  readonly type: "user" | "ruser";
  readonly username: string;
}

export interface UserReferenceOptions {
  /** Builds the profile URL; DMOJ reverses `user_page`, i.e. `/user/<name>`. */
  readonly href?: (username: string) => string;
  readonly onReference?: (reference: UserReference) => void;
}

/** `judge.jinja2.reference.rereference`. */
const REFERENCE = /\[(r?user):(\w+)\]/g;

const SKIP_INSIDE = new Set(["code", "pre", "script", "style", "textarea"]);

const rehypeUserReferences: Plugin<[UserReferenceOptions], Root> = function rehypeUserReferences(options) {
  const href = options.href ?? ((username: string) => `/user/${encodeURIComponent(username)}`);

  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      if (parent.type === "element" && SKIP_INSIDE.has((parent as Element).tagName)) return;
      if (!node.value.includes("[")) return;

      REFERENCE.lastIndex = 0;
      const pieces: RootContent[] = [];
      let last = 0;
      let match: RegExpExecArray | null = REFERENCE.exec(node.value);
      while (match) {
        const [whole, kind, username] = match as unknown as [string, "user" | "ruser", string];
        if (match.index > last) {
          pieces.push({ type: "text", value: node.value.slice(last, match.index) });
        }
        options.onReference?.({ type: kind, username });
        pieces.push({
          type: "element",
          tagName: "a",
          properties: {
            className: kind === "ruser" ? ["user-link", "rate-group"] : ["user-link"],
            href: href(username),
            "data-username": username,
            ...(kind === "ruser" ? { "data-rating": "true" } : {}),
          },
          children: [{ type: "text", value: username }],
        });
        last = match.index + whole.length;
        match = REFERENCE.exec(node.value);
      }
      if (pieces.length === 0) return;
      if (last < node.value.length) {
        pieces.push({ type: "text", value: node.value.slice(last) });
      }
      parent.children.splice(index, 1, ...pieces);
      return index + pieces.length;
    });
  };
};

/* --------------------------------------------------------------------- absolutify ----- */

export interface AbsolutifyOptions {
  readonly base: string;
}

/** `judge.jinja2.reference.absolute_links`, used by the printable statement page. */
const rehypeAbsolutify: Plugin<[AbsolutifyOptions], Root> = function rehypeAbsolutify(options) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const attribute = node.tagName === "a" ? "href" : node.tagName === "img" ? "src" : null;
      if (!attribute) return;
      const value = node.properties?.[attribute];
      if (typeof value !== "string" || !value) return;
      try {
        node.properties[attribute] = new URL(value, options.base).href;
      } catch {
        /* leave malformed URLs alone, as urljoin does */
      }
    });
  };
};

export {
  rehypeAbsolutify,
  rehypeCamo,
  rehypeLazyImages,
  rehypeNofollow,
  rehypeScrollableTables,
  rehypeTidyTables,
  rehypeUserReferences,
};
