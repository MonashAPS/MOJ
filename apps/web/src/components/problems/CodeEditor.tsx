"use client";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

/** DMOJ stores an Ace mode on every language; these are the ones MOJ ships a
 *  grammar for. Anything else falls back to plain text, which is legible. */
async function languageExtension(editorMode: string): Promise<Extension | null> {
  switch (editorMode) {
    case "c_cpp": {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      return java();
    }
    case "golang": {
      const { go } = await import("@codemirror/lang-go");
      return go();
    }
    case "javascript": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript();
    }
    case "rust": {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    }
    case "kotlin": {
      const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
      return StreamLanguage.define(kotlin);
    }
    default:
      return null;
  }
}

/** Built from the tokens, not `oneDark`: every colour resolves through a custom
 *  property, so the editor follows the site's theme with no second definition. */
const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-bg)",
    color: "var(--ink)",
    fontSize: "13.5px",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.55",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-2) 40%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "var(--code-bg)",
    color: "var(--muted)",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--surface-2) 40%, transparent)",
    color: "var(--ink-2)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius)",
    color: "var(--ink)",
  },
});

export function CodeEditor({
  value,
  onChange,
  onSubmit,
  editorMode,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  editorMode: string;
  ariaLabel: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  // Held in refs so the editor is created once and never torn down on a keystroke.
  const change = useRef(onChange);
  const submit = useRef(onSubmit);
  change.current = onChange;
  submit.current = onSubmit;

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    const editor = new EditorView({
      parent: node,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightActiveLine(),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                submit.current?.();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.lineWrapping,
          theme,
          language.current.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The document is pushed in by the effect below; recreating the editor on
    // every keystroke would lose the cursor.
  }, [ariaLabel]);

  useEffect(() => {
    let cancelled = false;
    void languageExtension(editorMode).then((extension) => {
      if (cancelled || !view.current) return;
      view.current.dispatch({ effects: language.current.reconfigure(extension ?? []) });
    });
    return () => {
      cancelled = true;
    };
  }, [editorMode]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} className={className} />;
}
