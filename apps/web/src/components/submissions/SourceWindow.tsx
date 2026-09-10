import { Panel } from "@moj/ui";
import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";
import styles from "./code.module.css";
import { titlebarAction } from "./titlebar";

/** The same pair `@moj/content` renders statements with, so code looks the same
 *  wherever it appears. */
const THEMES = { light: "github-light", dark: "github-dark" } as const;

/** Shiki's grammar ids differ from DMOJ's `Language.pygments`; `languages.shikiLang`
 *  already carries the right one, and anything unknown falls back to plain text. */
async function highlight(source: string, lang: string): Promise<string> {
  try {
    return await codeToHtml(source, { lang, themes: THEMES, defaultColor: false });
  } catch {
    return await codeToHtml(source, { lang: "text", themes: THEMES, defaultColor: false });
  }
}

/**
 * DMOJ's `submission/source.html`, as the site's window motif (DESIGN.md 14.4):
 * a titlebar carrying the language and the actions, over the highlighted body.
 */
export async function SourceWindow({
  source,
  shikiLang,
  languageName,
  actions,
  lineNumbers = false,
}: {
  source: string;
  shikiLang: string;
  languageName: string;
  actions?: React.ReactNode;
  /** `/src/<id>` numbers every line and lets one be linked to; the status page
   *  shows the same window without the gutter. */
  lineNumbers?: boolean;
}) {
  const html = await highlight(source, shikiLang || "text");
  const lines = source.split("\n").length;

  return (
    <Panel
      title={languageName}
      action={
        <span className="flex items-center gap-1">
          <CopyButton text={source} className={titlebarAction} />
          {actions}
        </span>
      }
      bodyClassName="p-0"
    >
      {lineNumbers ? (
        <div className="flex items-stretch overflow-x-auto bg-code">
          <div className={styles.numbers} aria-hidden>
            {Array.from({ length: lines }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a line number is its index
              <a key={index + 1} id={`line-${index + 1}`} href={`#line-${index + 1}`}>
                {index + 1}
              </a>
            ))}
          </div>
          <div
            className={`${styles.code} min-w-0 flex-1`}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output, escaped by Shiki
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : (
        <div
          className={styles.code}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output, escaped by Shiki
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </Panel>
  );
}
