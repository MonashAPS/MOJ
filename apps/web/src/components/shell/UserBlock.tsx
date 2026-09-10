"use client";

import { ChevronDown, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { type ThemeChoice, ThemeToggle } from "./ThemeToggle";

export type ViewerSummary = {
  username: string;
  displayName: string;
  isStaff: boolean;
  ratingClass: string;
  siteTheme: ThemeChoice;
  gravatarUrl: string;
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
      <span id="user-links">
        <span className="anon">
          <Link href="/accounts/login/">
            <b>Log in</b>
          </Link>
          {registrationOpen ? (
            <>
              <span>or</span>
              <Link href="/accounts/register/">
                <b>Sign up</b>
              </Link>
            </>
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <span id="user-links">
      <ul>
        <li>
          <Link href={`/user/${viewer.username}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="avatar" src={viewer.gravatarUrl} alt="" width={24} height={24} />
            <span className="username-text">
              Hello, <b className={viewer.ratingClass}>{viewer.displayName}</b>.
            </span>
            <ChevronDown size={13} aria-hidden />
          </Link>
          <ul className="nav-menu align-right">
            {viewer.isStaff ? (
              <li>
                <Link href="/admin">
                  <ShieldCheck size={14} aria-hidden />
                  Admin
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/edit/profile/">
                <Settings size={14} aria-hidden />
                Edit profile
              </Link>
            </li>
            <li>
              <ThemeToggle initial={viewer.siteTheme} />
            </li>
            <li>
              <button
                type="button"
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                <LogOut size={14} aria-hidden />
                Log out
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </span>
  );
}
