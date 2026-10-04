import { TooltipProvider } from "@moj/ui";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import contests from "../../../messages/en/contests.json";
import { ContestProgress } from "./ContestProgress";

it("keeps inaccessible problem boxes visible without a navigation target", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ contests }}>
      <TooltipProvider>
        <ContestProgress
          progress={{
            solved: 1,
            total: 2,
            problems: [
              { code: "open", name: "Open", label: "A", solved: true, isAccessible: true },
              { code: "secret", name: "Secret", label: "B", solved: false, isAccessible: false },
            ],
          }}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );

  expect(html).toMatch(/href="\/problem\/open\/?"/);
  expect(html).toContain('aria-label="Secret"');
  expect(html).not.toContain('href="/problem/secret');
  expect(html.match(/<a /g)).toHaveLength(1);
});
