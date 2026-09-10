"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@moj/ui";
import { ChevronDown, LogOut, Settings, UserCog, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { type ThemeChoice, ThemeSegmented, ThemeToggle } from "./ThemeToggle";

export type ViewerSummary = {
  username: string;
  displayName: string;
  isStaff: boolean;
  ratingClass: string;
  siteTheme: ThemeChoice;
  gravatarUrl: string;
  isImpersonating?: boolean;
};

export function UserBlock({
  viewer,
  registrationOpen = true,
}: {
  viewer: ViewerSummary | null;
  registrationOpen?: boolean;
}) {
  const router = useRouter();

  if (!viewer) {
    return (
      <div className="flex shrink-0 items-center gap-2 pl-2 pr-3">
        {/* Signed out there is no dropdown to hold it, so the switch sits here. */}
        <ThemeToggle tone="nav" />
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-nav-ink/90 hover:bg-nav-hover hover:text-nav-ink"
        >
          <Link href="/accounts/login/">Log in</Link>
        </Button>
        {registrationOpen ? (
          <Button asChild variant="canary" size="pill">
            <Link href="/accounts/register/">Sign up</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const initials = viewer.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex shrink-0 items-center pr-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex h-11 items-center gap-2 px-3 text-base font-medium text-nav-ink transition-colors",
            "hover:bg-nav-hover data-[state=open]:bg-nav-hover",
          )}
        >
          <Avatar className="size-6">
            <AvatarImage src={viewer.gravatarUrl} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          {/* Rating colours on the nav's dark ground use the dark values. */}
          <span
            data-chrome="dark"
            className={cn("max-w-[12ch] truncate font-mono font-medium", viewer.ratingClass)}
          >
            {viewer.displayName}
          </span>
          <ChevronDown size={14} aria-hidden className="shrink-0 text-nav-ink-2" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
          {viewer.isStaff ? (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Settings aria-hidden />
                Admin
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={`/user/${viewer.username}`}>
              <UserCog aria-hidden />
              My profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/edit/profile/">
              <UserCog aria-hidden />
              Edit profile
            </Link>
          </DropdownMenuItem>
          {viewer.isImpersonating ? (
            <DropdownMenuItem
              className="text-warn"
              onSelect={async () => {
                await authClient.admin.stopImpersonating();
                router.push("/admin/users/");
                router.refresh();
              }}
            >
              <UserX aria-hidden />
              Stop impersonating
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <div className="px-1 pb-1">
            <ThemeSegmented initial={viewer.siteTheme} />
          </div>

          <DropdownMenuSeparator />
          {/* DMOJ logs out with a POST, so the item goes to the confirmation page
              rather than ending a session from a menu. */}
          <DropdownMenuItem variant="destructive" asChild>
            <Link href="/accounts/logout/">
              <LogOut aria-hidden />
              Log out
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
