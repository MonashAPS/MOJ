"use client";

import { Button, Dialog, DialogContent, DialogTrigger, Input, ScrollArea } from "@moj/ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeferredValue, useMemo, useState } from "react";
import { markFor, monogramFor } from "./languageMarks";

export type PickableLanguage = {
  key: string;
  name: string;
  shortName: string;
  commonName: string;
  runnable: boolean;
};

/** The tile: a mark where one exists, a monogram in its colour where none does. */
function Mark({ commonName }: { commonName: string }) {
  const { path, hex } = markFor(commonName);
  if (!path) {
    return (
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
        style={{ backgroundColor: `#${hex}` }}
      >
        {monogramFor(commonName)}
      </span>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0" fill={`#${hex}`} role="presentation">
      <path d={path} />
    </svg>
  );
}

/**
 * Choosing what to write in.
 *
 * A dropdown of seventy runtimes grouped by language meant scrolling to find
 * anything and gave a category and one of its versions the same weight. This
 * lays every language out at once as marks you can recognise without reading,
 * with the versions of each beside its name rather than nested under it, and a
 * search that narrows the lot.
 */
export function LanguagePicker({
  languages,
  value,
  onChange,
  disabled,
}: {
  languages: PickableLanguage[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("problems.submit");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Typing should not wait on seventy tiles re-rendering.
  const deferred = useDeferredValue(query);

  const selected = languages.find((row) => row.key === value) ?? null;

  /** One entry per language, carrying its versions. */
  const families = useMemo(() => {
    const byName = new Map<string, PickableLanguage[]>();
    for (const language of languages) {
      const name = language.commonName || language.name;
      byName.set(name, [...(byName.get(name) ?? []), language]);
    }
    const needle = deferred.trim().toLowerCase();
    return [...byName.entries()]
      .map(([name, items]) => ({
        name,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(({ name, items }) =>
        needle.length === 0
          ? true
          : name.toLowerCase().includes(needle) ||
            items.some(
              (item) => item.name.toLowerCase().includes(needle) || item.key.toLowerCase().includes(needle),
            ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [languages, deferred]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled} className="w-56 justify-between bg-card">
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <span className="scale-75">
                <Mark commonName={selected.commonName || selected.name} />
              </span>
            ) : null}
            <span className="truncate">{selected ? selected.name : t("language")}</span>
          </span>
          <ChevronDown size={14} aria-hidden className="shrink-0 opacity-60" />
        </Button>
      </DialogTrigger>

      <DialogContent title={t("language")} className="max-w-[68rem]">
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchLanguages")}
            aria-label={t("searchLanguages")}
            className="pl-8"
          />
        </div>

        <ScrollArea className="max-h-[68dvh]">
          {families.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noLanguages")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 pr-2 min-[640px]:grid-cols-3 min-[900px]:grid-cols-4 min-[1180px]:grid-cols-5">
              {families.map((family) => (
                <div
                  key={family.name}
                  className="rounded-md border border-border p-3 transition-colors hover:border-primary-line hover:bg-primary-soft"
                >
                  <div className="mb-2 flex items-center gap-2.5">
                    <Mark commonName={family.name} />
                    <span className="truncate text-base font-semibold">{family.name}</span>
                  </div>
                  {/* Versions sit beside the language rather than under it, so
                      picking "Python" and picking "Python 3" are plainly
                      different acts. */}
                  <div className="flex flex-wrap gap-1">
                    {family.items.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => {
                          onChange(item.key);
                          setOpen(false);
                        }}
                        title={item.runnable ? item.name : t("noJudgeFor", { name: item.name })}
                        // A chip that does not change under the pointer does
                        // not read as something you can press, which is what
                        // the first person to use this said about it.
                        className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[13px] transition-[background-color,border-color,box-shadow] ${
                          item.key === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary hover:bg-primary-soft hover:shadow-xs"
                        } ${item.runnable ? "" : "opacity-55"}`}
                      >
                        {item.key === value ? <Check size={12} aria-hidden /> : null}
                        {item.shortName || item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
