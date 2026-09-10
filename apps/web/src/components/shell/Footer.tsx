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
    <footer>
      <div id="footer-content">
        <a href="https://github.com/MonashAPS/MOJ">
          proudly powered by <b>MOJ</b>
        </a>
        <span className="footer-sep" aria-hidden>
          |
        </span>
        {footerHtml ? (
          <>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: misc config, staff authored */}
            <span dangerouslySetInnerHTML={{ __html: footerHtml }} />
            <span className="footer-sep" aria-hidden>
              |
            </span>
          </>
        ) : null}
        <span className="footer-language">
          <Select
            ariaLabel="Site language"
            value={language}
            options={LANGUAGES}
            onValueChange={(value) => {
              setLanguage(value);
              // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not in every browser MOJ supports
              document.cookie = `moj-language=${value};path=/;max-age=31536000;samesite=lax`;
              router.refresh();
            }}
          />
        </span>
      </div>
    </footer>
  );
}
