import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

// The real join control imports auth configuration; rendering never connects to the database.
process.env.DATABASE_URL ??= "postgresql://moj:moj@127.0.0.1:5433/moj_auth";

process.env.AUTH_SECRET ??= "test-secret-for-unit-tests-only-0123456789";

let ProblemsJoinCover: typeof import("./ProblemsJoinCover").ProblemsJoinCover;

beforeAll(async () => {
  ({ ProblemsJoinCover } = await import("./ProblemsJoinCover"));
});

describe("problems join cover server rendering", () => {
  function render(initiallyDismissed: boolean, joinKind: "join" | "login" | null = "login") {
    return renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{
          contests: {
            detail: {
              joinBeforeSubmittingTitle: "Join before submitting",
              joinBeforeSubmitting: "Join this contest to submit solutions.",
              loginToJoin: "Log in to join",
              viewProblems: "View problems",
            },
          },
        }}
      >
        <ProblemsJoinCover contestKey="example" joinKind={joinKind} initiallyDismissed={initiallyDismissed}>
          <p>Short problem list</p>
        </ProblemsJoinCover>
      </NextIntlClientProvider>,
    );
  }

  it("renders only the short list when the saved preference dismisses the cover", () => {
    expect(render(true)).toBe("<p>Short problem list</p>");
  });

  it("renders the reminder on the server when it has not been dismissed", () => {
    expect(render(false)).toContain("Join before submitting");
    expect(render(false)).toContain('inert=""');
  });

  it("never covers the list when joining is not required", () => {
    expect(render(false, null)).toBe("<p>Short problem list</p>");
  });
});
