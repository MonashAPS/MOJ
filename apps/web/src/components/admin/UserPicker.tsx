"use client";

import { api } from "@convex/_generated/api";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** DMOJ's heavy select2 on `profile_select2`: type a name, pick, get a chip. */
export function UserPicker({
  values,
  onChange,
  id,
  disabled,
  disabledReason,
  placeholder,
  ariaLabel,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const t = useTranslations("admin.components.userPicker");
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const matches = useQuery(api.pages.admin.console.profileSearch, open ? { term, limit: 10 } : "skip");
  const options = (matches ?? []).filter((row) => !values.includes(row.username));

  return (
    <div className={cn("grid gap-2", className)} title={disabled ? disabledReason : undefined}>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={ariaLabel ?? t("chosen")}>
          {values.map((username) => (
            <li key={username}>
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-primary-line bg-primary-soft pl-2 pr-[2px] font-mono text-xs text-primary">
                <span className="truncate">{username}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t("remove", { username })}
                  onClick={() => onChange(values.filter((entry) => entry !== username))}
                  className="flex size-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            size="sm"
            disabled={disabled}
            aria-label={ariaLabel}
            icon={<Plus aria-hidden />}
            className="w-fit font-normal"
          >
            {placeholder ?? t("add")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={term}
              onValueChange={setTerm}
              placeholder={t("searchPlaceholder")}
              showEscHint={false}
            />
            <CommandList>
              <CommandEmpty>
                {term.trim() ? t("noMatches", { term: term.trim() }) : t("searchPrompt")}
              </CommandEmpty>
              {options.length > 0 ? (
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.username}
                      value={option.username}
                      onSelect={() => {
                        onChange([...values, option.username]);
                        setTerm("");
                      }}
                    >
                      <span className="truncate font-mono">{option.username}</span>
                      {option.rating !== null ? (
                        <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                          {option.rating}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
