"use client";

import { Button, Input, MicroLabel, MultiSelect, Panel } from "@moj/ui";
import { Filter, Search, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [term, setTerm] = useState("");
  const active = selectedStatuses.length + selectedLanguages.length;

  return (
    <Panel
      title="Filter submissions"
      icon={<Filter aria-hidden className="size-3.5" />}
      bodyClassName="grid gap-4 p-3"
    >
      <div className="grid gap-1.5">
        <MicroLabel>Status</MicroLabel>
        <MultiSelect
          id="filter-status"
          ariaLabel="Filter by status"
          placeholder="Any status"
          searchPlaceholder="Filter statuses…"
          emptyText="No status matches."
          options={statuses}
          values={selectedStatuses}
          onChange={(next) => onChange({ status: next })}
        />
      </div>

      <div className="grid gap-1.5 border-t border-border pt-4">
        <MicroLabel>Language</MicroLabel>
        <MultiSelect
          id="filter-language"
          ariaLabel="Filter by language"
          placeholder="Any language"
          searchPlaceholder="Filter languages…"
          emptyText="No language matches."
          options={languages}
          values={selectedLanguages}
          onChange={(next) => onChange({ language: next })}
        />
      </div>

      <div className="grid gap-1.5 border-t border-border pt-4">
        <MicroLabel>User</MicroLabel>
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
            placeholder="Username"
            icon={<Search aria-hidden />}
            aria-label="Show one user's submissions"
          />
        </form>
        {myHref && myUsername ? (
          <Link
            href={myHref}
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-link hover:text-link-hover"
          >
            <User aria-hidden className="size-3.5" />
            My submissions
          </Link>
        ) : null}
      </div>

      {active > 0 ? (
        <div className="-mx-3 -mb-3 flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">
            {active} filter{active === 1 ? "" : "s"}
          </span>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
