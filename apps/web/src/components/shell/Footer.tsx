"use client";

import { Select } from "@moj/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, SITE_LANGUAGES } from "@/lib/language";

const LANGUAGES = SITE_LANGUAGES.map((language) => ({
  value: language.code,
  label: language.label,
}));

export function Footer({
  footerHtml,
  language: initialLanguage,
}: {
  footerHtml?: string;
  language?: string;
}) {
  const t = useTranslations("common.footer");
  const router = useRouter();
  const [language, setLanguage] = useState(initialLanguage ?? DEFAULT_LANGUAGE);

  return (
    <footer className="mt-8 border-t border-border bg-ground">
      <div className="mx-auto flex w-full max-w-(--content-max) flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-4 text-sm text-muted-foreground md:px-6">
        <a href="https://github.com/MonashAPS/MOJ" className="text-muted-foreground hover:text-subtle">
          {t.rich("poweredBy", { name: (chunks) => <b className="font-semibold">{chunks}</b> })}
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
          ariaLabel={t("siteLanguage")}
          value={language}
          options={LANGUAGES}
          className="w-[168px]"
          onValueChange={(value) => {
            setLanguage(value);
            // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not in every browser MOJ supports
            document.cookie = `${LANGUAGE_COOKIE}=${value};path=/;max-age=31536000;samesite=lax`;
            router.refresh();
          }}
        />
      </div>
    </footer>
  );
}
