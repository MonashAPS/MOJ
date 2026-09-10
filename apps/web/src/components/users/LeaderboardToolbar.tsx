"use client";

import { api } from "@convex/_generated/api";
import { cn, InputGroup, InputGroupInput, Label, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

export type OrganizationOption = { slug: string; name: string };

/**
 * `base-users.html`'s top bar: the handle search that `/users/find` turns into a
 * page number, and the organisation filter. Suggestions come from the same
 * search index the command palette uses; typing a handle and pressing Enter works
 * without them.
 */
export function LeaderboardToolbar({
  organizations,
  organizationSlug,
  params,
}: {
  organizations: OrganizationOption[];
  organizationSlug: string | null;
  params: string;
}) {
  const router = useRouter();
  const searchId = useId();
  const filterId = useId();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);

  const hits = useQuery(api.search.global, term.trim().length > 0 ? { term: term.trim(), limit: 6 } : "skip");
  const users = (hits ?? []).filter((hit) => hit.kind === "user");

  function go(handle: string) {
    const trimmed = handle.trim();
    if (!trimmed) return;
    setOpen(false);
    // A full navigation, as DMOJ's GET form is: the redirect lands on
    // `#!username`, and the router would not re-run the row highlight when the
    // page it lands on is the one already mounted.
    window.location.assign(`/users/find/?handle=${encodeURIComponent(trimmed)}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(term);
  }

  function onOrganization(value: string) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value === "all") next.delete("organization");
    else next.set("organization", value);
    const query = next.toString();
    router.push(query ? `/users/?${query}` : "/users/");
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-4">
      <form onSubmit={onSubmit} className="min-w-0 flex-1 basis-64">
        <Label htmlFor={searchId}>Search by handle</Label>
        <div className="relative mt-1">
          <InputGroup leading={<Search className="size-4" aria-hidden />}>
            <InputGroupInput
              id={searchId}
              name="handle"
              type="search"
              autoComplete="off"
              placeholder="Search by handle…"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            />
          </InputGroup>
          {open && users.length > 0 ? (
            <ul
              className={cn(
                "absolute inset-x-0 top-[calc(100%+4px)] z-(--z-dialog) overflow-hidden rounded-md",
                "border border-border bg-popover p-1 shadow-2",
              )}
            >
              {users.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    // The list closes on blur, so the click has to land first.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(hit.title)}
                    className="flex h-7 w-full items-center rounded-sm px-2 text-left font-mono text-mono text-foreground hover:bg-accent"
                  >
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </form>

      {organizations.length > 0 ? (
        <div className="w-56 shrink-0">
          <Label htmlFor={filterId}>Organization</Label>
          <div className="mt-1">
            <Select
              id={filterId}
              ariaLabel="Filter by organization"
              value={organizationSlug ?? "all"}
              onValueChange={onOrganization}
              options={[
                { value: "all", label: "All organizations" },
                ...organizations.map((organization) => ({
                  value: organization.slug,
                  label: organization.name,
                })),
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
