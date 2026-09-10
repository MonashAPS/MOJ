"use client";

import { Select } from "@moj/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LANGUAGES = [
  { value: "en", label: "English (en)" },
  { value: "zh-hans", label: "简体中文 (zh-hans)" },
  { value: "vi", label: "Tiếng Việt (vi)" },
  { value: "fr", label: "Français (fr)" },
];

export function Footer({ footerHtml }: { footerHtml?: string }) {
  const router = useRouter();
  const [language, setLanguage] = useState("en");

  return (
    <footer className="mt-8 border-t border-border bg-ground">
      <div className="mx-auto flex w-full max-w-(--content-max) flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-4 text-sm text-muted-foreground md:px-6">
        <a href="https://github.com/MonashAPS/MOJ" className="text-muted-foreground hover:text-subtle">
          proudly powered by <b className="font-semibold">MOJ</b>
        </a>
        {footerHtml ? (
          <>
            <span aria-hidden className="text-border-strong">
              |
            </span>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: misc config, staff authored */}
            <span dangerouslySetInnerHTML={{ __html: footerHtml }} />
          </>
        ) : null}
        <span aria-hidden className="text-border-strong">
          |
        </span>
        <Select
          size="sm"
          ariaLabel="Site language"
          value={language}
          options={LANGUAGES}
          className="w-[168px]"
          onValueChange={(value) => {
            setLanguage(value);
            // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not in every browser MOJ supports
            document.cookie = `moj-language=${value};path=/;max-age=31536000;samesite=lax`;
            router.refresh();
          }}
        />
      </div>
    </footer>
  );
}
