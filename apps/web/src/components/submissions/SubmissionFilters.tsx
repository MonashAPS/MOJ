"use client";

import { Button, Input, MicroLabel, MultiSelect, Panel } from "@moj/ui";
import { Filter, Search, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type FilterOption = { value: string; label: string };

/**
 * DMOJ's "Filter submissions" side box. Its two native multi-selects and its
 * "Go" button become the kit's MultiSelect, and every choice writes to the URL
 * query so a filtered list is a shareable link (SPEC section 20).
 */
export function SubmissionFilters({
  statuses,
  languages,
  selectedStatuses,
  selectedLanguages,
  onChange,
  onReset,
  myUsername,
  myHref,
  userSearchHref,
}: {
  statuses: FilterOption[];
  languages: FilterOption[];
  selectedStatuses: string[];
  selectedLanguages: string[];
  onChange: (next: { status?: string[]; language?: string[] }) => void;
  onReset: () => void;
  myUsername: string | null;
  myHref: string | null;
  /** Builds the destination for the user search box. */
  userSearchHref: (username: string) => string;
}) {
  const t = useTranslations("submissions.filters");
  const router = useRouter();
  const [term, setTerm] = useState("");
  const active = selectedStatuses.length + selectedLanguages.length;

  return (
    <Panel
      title={t("title")}
      icon={<Filter aria-hidden className="size-3.5" />}
      bodyClassName="grid gap-4 p-3"
    >
      <div className="grid gap-1.5">
        <MicroLabel>{t("status")}</MicroLabel>
        <MultiSelect
          id="filter-status"
          ariaLabel={t("statusAria")}
          placeholder={t("anyStatus")}
          searchPlaceholder={t("statusSearch")}
          emptyText={t("statusEmpty")}
          options={statuses}
          values={selectedStatuses}
          onChange={(next) => onChange({ status: next })}
        />
      </div>

      <div className="grid gap-1.5 border-t border-border pt-4">
        <MicroLabel>{t("language")}</MicroLabel>
        <MultiSelect
          id="filter-language"
          ariaLabel={t("languageAria")}
          placeholder={t("anyLanguage")}
          searchPlaceholder={t("languageSearch")}
          emptyText={t("languageEmpty")}
          options={languages}
          values={selectedLanguages}
          onChange={(next) => onChange({ language: next })}
        />
      </div>

      <div className="grid gap-1.5 border-t border-border pt-4">
        <MicroLabel>{t("user")}</MicroLabel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const username = term.trim();

            if (username) router.push(userSearchHref(username));
          }}
        >
          <Input
            id="filter-user"
            name="user"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("username")}
            icon={<Search aria-hidden />}
            aria-label={t("userAria")}
          />
        </form>
        {myHref && myUsername ? (
          <Link
            href={myHref}
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-link hover:text-link-hover"
          >
            <User aria-hidden className="size-3.5" />
            {t("mySubmissions")}
          </Link>
        ) : null}
      </div>

      {active > 0 ? (
        <div className="-mx-3 -mb-3 flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{t("activeCount", { count: active })}</span>
          <Button variant="ghost" size="sm" onClick={onReset}>
            {t("reset")}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
