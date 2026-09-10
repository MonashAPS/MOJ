// biome-ignore-all lint/suspicious/noArrayIndexKey: blocks and list items are a static,
// ordered render of an immutable string; nothing is ever inserted or reordered.

import type { ReactNode } from "react";

/** A deliberately small renderer for flat pages and post bodies: headings,
 *  paragraphs, ordered and unordered lists, and inline links and bold. The real
 *  pipeline (remark, KaTeX, Shiki, sanitiser presets) arrives with
 *  @moj/content and replaces this. */
export function renderFlatPage(source: string): ReactNode {
  const blocks = source.split(/\n\s*\n/);
  return blocks.map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? "";
      const key = `h-${index}`;
      if (level === 1) return <h1 key={key}>{inline(text)}</h1>;
      if (level === 2) return <h2 key={key}>{inline(text)}</h2>;
      if (level === 3) return <h3 key={key}>{inline(text)}</h3>;
      return <h4 key={key}>{inline(text)}</h4>;
    }

    const lines = trimmed.split("\n");
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return (
        <ul key={`ul-${index}`}>
          {lines.map((line, itemIndex) => (
            <li key={`ul-${index}-${itemIndex}`}>{inline(line.replace(/^\s*[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }
    if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
      return (
        <ol key={`ol-${index}`}>
          {lines.map((line, itemIndex) => (
            <li key={`ol-${index}-${itemIndex}`}>{inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>
          ))}
        </ol>
      );
    }

    return <p key={`p-${index}`}>{inline(trimmed.replace(/\n/g, " "))}</p>;
  });
}

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex walk
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    if (match[1] && match[2]) {
      out.push(
        <a key={`a-${match.index}`} href={match[2]}>
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      out.push(<strong key={`b-${match.index}`}>{match[3]}</strong>);
    } else if (match[4]) {
      out.push(<code key={`c-${match.index}`}>{match[4]}</code>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
