import type { TabItem } from "@moj/ui";
import { KeyRound, Mail, ShieldCheck, Terminal, UserCog } from "lucide-react";

export type AccountTab = "profile" | "two-factor" | "passkeys" | "email" | "token";

/** The account section's tab bar, in the order DMOJ puts these controls on its
 *  edit-profile page. */
export function accountTabs(): TabItem[] {
  return [
    { key: "profile", label: "Profile", href: "/edit/profile/", icon: <UserCog aria-hidden /> },
    { key: "two-factor", label: "Two factor", href: "/accounts/2fa/", icon: <ShieldCheck aria-hidden /> },
    {
      key: "passkeys",
      label: "Passkeys",
      href: "/accounts/2fa/webauthn/attest/",
      icon: <KeyRound aria-hidden />,
    },
    { key: "email", label: "Email", href: "/accounts/email/change/", icon: <Mail aria-hidden /> },
    {
      key: "token",
      label: "API token",
      href: "/accounts/api/token/generate/",
      icon: <Terminal aria-hidden />,
    },
  ];
}
