// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Exercise real forms, cover, bar and Radix dialogs; replace only network/framework hooks and the editor DOM adapter. */

import { api } from "@convex/_generated/api";
import type { ContestBarData } from "@convex/contests";
import { type FunctionReference, type FunctionReturnType, getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import common from "../../../messages/en/common.json";
import contests from "../../../messages/en/contests.json";
import problems from "../../../messages/en/problems.json";

type QueryArgs = "skip" | { key?: string; browsing?: boolean; code?: string; languageKey?: string };

type TestState = {
  pathname: string;
  submit: ReturnType<
    typeof vi.fn<
      (attempt: { problemCode: string; languageKey: string; source: string }) => Promise<{ id: number }>
    >
  >;
  push: ReturnType<typeof vi.fn<(href: string) => void>>;
  dismiss: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
  acknowledgement: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;
  preferred: { key: string } | null | undefined;
  live: { showJoinWarning: boolean; problems: { code: string }[] } | null | undefined;
  queried: QueryArgs[];
  usable: FunctionReturnType<typeof api.languages.usableForProblem> | undefined;
};

const state = vi.hoisted(
  (): TestState => ({
    pathname: "/contest/round1/problem/alpha/submit/",
    submit: vi.fn(),
    push: vi.fn(),
    dismiss: vi.fn(),
    acknowledgement: vi.fn(),
    preferred: undefined,
    live: undefined,
    queried: [],
    usable: undefined,
  }),
);

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => state.submit,
  useQuery: (query: FunctionReference<"query">, args: QueryArgs) => {
    if (getFunctionName(query) === getFunctionName(api.contests.navBar) && args !== "skip")
      state.queried.push(args);

    if (args === "skip") return undefined;

    if (getFunctionName(query) === getFunctionName(api.contests.navBar)) return state.live;

    if (getFunctionName(query) === getFunctionName(api.languages.usableForProblem)) return state.usable;

    if (getFunctionName(query) === getFunctionName(api.languages.viewerDefault)) return state.preferred;

    return null;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => state.pathname,
}));

vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));

vi.mock("@/components/contests/JoinControls", () => ({ JoinControl: () => null }));

vi.mock("@/app/contest/[key]/actions", () => ({
  dismissProblemsJoinCover: (key: string) => state.dismiss(key),
  readProblemsJoinCoverAcknowledgement: (key: string) => state.acknowledgement(key),
}));

vi.mock("./CodeEditor", () => ({
  CodeEditor: ({
    value,
    onChange,
    onSubmit,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
  }) => (
    <textarea
      aria-label="Source"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key === "Enter") onSubmit();
      }}
    />
  ),
}));

import { ProblemsJoinCover } from "@/app/contest/[key]/ProblemsJoinCover";
import { ContestBar } from "@/components/shell/ContestBar";
import { DomjudgeSubmit } from "@/components/shell/DomjudgeSubmit";
import { QuickSubmit } from "./QuickSubmit";
import { SubmitForm, type SubmitReminder } from "./SubmitForm";

let root: Root;

let host: HTMLDivElement;

const reminder: SubmitReminder = {
  key: "round1",
  name: "Round One",
  eligible: true,
  acknowledged: false,
  serverHadViewer: true,
};

const formProps = {
  problemCode: "alpha",
  problemName: "Alpha",
  defaultLanguageKey: "PY3",
  initialSource: "print(1)",
  canPinJudge: false,
  submissionsLeft: null,
};

beforeEach(() => {
  state.pathname = "/contest/round1/problem/alpha/submit/";
  // React's DOM test harness expects this flag when act is used directly.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.submit.mockReset().mockResolvedValue({ id: 123 });
  state.push.mockReset();
  state.dismiss.mockReset().mockResolvedValue(undefined);
  state.acknowledgement.mockReset().mockResolvedValue(false);
  state.preferred = { key: "PY3" };
  state.live = undefined;
  state.queried = [];
  state.usable = {
    problemCode: "alpha",
    languages: [
      {
        key: "PY3",
        name: "Python 3",
        shortName: "PY3",
        commonName: "Python",
        runnable: true,
        editorMode: "python",
        shikiLang: "python",
        template: "",
        extension: ".py",
        timeLimit: 1,
        memoryLimit: 64,
      },
    ],
    onlineJudges: 1,
  };
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(child: React.ReactNode) {
  await act(async () =>
    root.render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ problems, contests, common }}>
        {child}
      </NextIntlClientProvider>,
    ),
  );
}

function button(label: string) {
  const found = [...document.querySelectorAll("button")].find((node) => node.textContent === label);

  if (!found) throw new Error(`Missing button: ${label}`);

  return found;
}

async function click(label: string) {
  await act(async () => {
    button(label).focus();
    button(label).click();
  });
}

async function shortcut() {
  await act(async () => {
    const editor = document.querySelector("textarea");
    editor?.focus();
    editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  });
}

describe("submission language selection", () => {
  it("accepts a preference loaded after mount", async () => {
    await render(<SubmitForm {...formProps} defaultLanguageKey={null} />);
    expect(button("Submit!").disabled).toBe(true);
    await render(<SubmitForm {...formProps} defaultLanguageKey="PY3" />);
    expect(button("Python 3")).toBeDefined();
    await shortcut();
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({ languageKey: "PY3" }));
  });

  it("preserves an explicit choice when the preference changes", async () => {
    await render(<SubmitForm {...formProps} defaultLanguageKey={null} />);
    await click("Language");
    await click("PY3");
    await render(<SubmitForm {...formProps} defaultLanguageKey="CPP" />);
    expect(button("Python 3")).toBeDefined();
    await shortcut();
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({ languageKey: "PY3" }));
  });

  it.each(["button", "keyboard"])(
    "leaves an unsupported preference unselected and blocks %s submission",
    async (method) => {
      await render(<SubmitForm {...formProps} defaultLanguageKey="CPP" />);
      expect(button("Language")).toBeDefined();
      expect(button("Submit!").disabled).toBe(true);
      expect(document.querySelector("textarea")?.value).toBe("print(1)");

      if (method === "button") await click("Submit!");
      else await shortcut();

      expect(state.submit).not.toHaveBeenCalled();
    },
  );

  it.each(["PY3", "CPP"])(
    "disables submission while languages load, then validates preference %s",
    async (preference) => {
      const usable = state.usable;
      state.usable = undefined;
      await render(<SubmitForm {...formProps} defaultLanguageKey={preference} />);
      expect(button("Submit!").disabled).toBe(true);
      await shortcut();
      expect(state.submit).not.toHaveBeenCalled();

      state.usable = usable;
      await render(<SubmitForm {...formProps} defaultLanguageKey={preference} />);
      expect(button(preference === "PY3" ? "Python 3" : "Language")).toBeDefined();
      expect(button("Submit!").disabled).toBe(preference !== "PY3");
      await shortcut();
      expect(state.submit).toHaveBeenCalledTimes(preference === "PY3" ? 1 : 0);
    },
  );

  it("leaves the language unselected when no preference is set", async () => {
    await render(<SubmitForm {...formProps} defaultLanguageKey={null} />);
    expect(button("Language")).toBeDefined();
    expect(button("Submit!").disabled).toBe(true);
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it("enables submission after explicitly choosing an available language", async () => {
    await render(<SubmitForm {...formProps} defaultLanguageKey="CPP" />);
    await click("Language");
    await click("PY3");
    expect(button("Python 3")).toBeDefined();
    expect(button("Submit!").disabled).toBe(false);
    expect(document.querySelector("textarea")?.value).toBe("print(1)");
    await click("Submit!");
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(state.submit).toHaveBeenCalledWith({
      problemCode: "alpha",
      languageKey: "PY3",
      source: "print(1)",
      judgePin: undefined,
    });
  });

  it("disables submission when no languages are allowed", async () => {
    state.usable = { problemCode: "alpha", languages: [], onlineJudges: 0 };
    await render(<SubmitForm {...formProps} />);
    expect(button("Submit!").disabled).toBe(true);
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
  });
});

describe("DOMjudge navigation submission", () => {
  const props = {
    contest: { key: "round1", name: "Round One", showJoinWarning: true },
    problems: [{ code: "alpha", name: "Alpha", label: "A" }],
  };

  it.each(["/accounts/password/change/", "/accounts/logout/"])(
    "opens the contextual result after submitting from %s",
    async (pathname) => {
      state.pathname = pathname;
      window.localStorage.setItem("submit:alpha:PY3", "print(1)");
      await render(<DomjudgeSubmit {...props} contest={{ ...props.contest, showJoinWarning: false }} />);
      await click("Submit!");
      await shortcut();
      expect(state.submit).toHaveBeenCalledTimes(1);
      expect(state.push).toHaveBeenCalledWith("/contest/round1/submission/123");
    },
  );

  it.each([false, true])("respects saved acknowledgement=%s", async (acknowledged) => {
    state.acknowledgement.mockResolvedValue(acknowledged);
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(<DomjudgeSubmit {...props} />);
    expect(state.acknowledgement).not.toHaveBeenCalled();
    expect(state.queried).toHaveLength(0);
    await click("Submit!");
    expect(state.acknowledgement).toHaveBeenCalledWith("round1");
    await shortcut();

    if (acknowledged) {
      expect(state.submit).toHaveBeenCalledTimes(1);
    } else {
      expect(state.submit).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain("You haven’t joined Round One");
      await click("Submit anyway");
      expect(state.submit).toHaveBeenCalledTimes(1);
    }

    expect(state.dismiss).not.toHaveBeenCalled();
    expect(state.push).toHaveBeenCalledWith("/contest/round1/submission/123");
  });

  it("waits for acknowledgement and a late language preference", async () => {
    let resolveAcknowledgement!: (saved: boolean) => void;
    state.acknowledgement.mockReturnValue(
      new Promise((resolve) => {
        resolveAcknowledgement = resolve;
      }),
    );
    state.preferred = undefined;
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(<DomjudgeSubmit {...props} />);
    await click("Submit!");
    expect(document.querySelector("textarea")).toBeNull();
    await act(async () => resolveAcknowledgement(false));
    expect(button("Language")).toBeDefined();
    state.preferred = { key: "PY3" };
    await render(<DomjudgeSubmit {...props} />);
    expect(button("Python 3")).toBeDefined();
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("You haven’t joined Round One");
  });

  it("still warns if reading acknowledgement fails", async () => {
    state.acknowledgement.mockRejectedValue(new Error("Offline"));
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(<DomjudgeSubmit {...props} />);
    await click("Submit!");
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("You haven’t joined Round One");
  });

  it("reads a newly saved acknowledgement when reopened", async () => {
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(<DomjudgeSubmit {...props} />);
    await click("Submit!");
    await shortcut();
    await click("Go back");
    await act(async () => {
      const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
      close?.click();
    });
    state.acknowledgement.mockResolvedValue(true);
    await click("Submit!");
    expect(state.acknowledgement).toHaveBeenCalledTimes(2);
    await shortcut();
    expect(state.submit).toHaveBeenCalledTimes(1);
  });
});

describe("submission-attempt confirmation", () => {
  it.each([false, true])(
    "waits for confirmation, preserves drafts on cancel, and sends once (compact=%s)",
    async (compact) => {
      await render(<SubmitForm {...formProps} reminder={reminder} compact={compact} />);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await click("Submit!");
      expect(document.body.textContent).toContain("You haven’t joined Round One");
      expect(state.submit).not.toHaveBeenCalled();
      await click("Go back");
      expect(document.querySelector("textarea")?.value).toBe("print(1)");
      await vi.waitFor(() => expect(document.activeElement).toBe(button("Submit!")));
      await shortcut();
      const confirm = button("Submit anyway");
      await act(async () => {
        confirm.click();
        confirm.click();
      });
      expect(state.submit).toHaveBeenCalledTimes(1);
      expect(state.submit).toHaveBeenCalledWith({
        problemCode: "alpha",
        languageKey: "PY3",
        source: "print(1)",
        judgePin: undefined,
      });
      expect(state.push).toHaveBeenCalledWith("/contest/round1/submission/123");
      expect(state.dismiss).not.toHaveBeenCalled();
    },
  );

  it("validates before warning and does not let keyboard attempts bypass limits", async () => {
    await render(<SubmitForm {...formProps} initialSource=" " reminder={reminder} />);
    await shortcut();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await render(<SubmitForm {...formProps} reminder={reminder} submissionsLeft={0} />);
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it.each(["saved", "ineligible", "standalone"])("sends immediately when %s", async (scenario) => {
    await render(
      <SubmitForm
        {...formProps}
        reminder={
          scenario === "standalone"
            ? undefined
            : { ...reminder, acknowledged: scenario === "saved", eligible: scenario !== "ineligible" }
        }
      />,
    );
    await shortcut();
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("uses current cookie props and live participation after the form has mounted", async () => {
    await render(<SubmitForm {...formProps} reminder={reminder} />);
    state.live = { showJoinWarning: false, problems: [{ code: "alpha" }] };
    await render(<SubmitForm {...formProps} reminder={reminder} />);
    await shortcut();
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("warns after live leave even when the server seed was joined", async () => {
    state.live = { showJoinWarning: true, problems: [{ code: "alpha" }] };
    await render(<SubmitForm {...formProps} reminder={{ ...reminder, eligible: false }} />);
    await shortcut();
    expect(state.submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("You haven’t joined Round One");
    await act(async () =>
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector("textarea")));
  });

  it("takes updated acknowledgement props without freezing their initial value", async () => {
    await render(<SubmitForm {...formProps} reminder={reminder} />);
    await render(<SubmitForm {...formProps} reminder={{ ...reminder, acknowledged: true }} />);
    await shortcut();
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("cancels a warning inside quick submit without closing its outer dialog or losing focus", async () => {
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(
      <QuickSubmit {...formProps} reminder={reminder}>
        <button type="button">Quick submit</button>
      </QuickSubmit>,
    );
    await click("Quick submit");
    await shortcut();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await click("Go back");
    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1));
    await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector("textarea")));
    expect(document.querySelector("textarea")?.value).toBe("print(1)");
    expect(state.submit).not.toHaveBeenCalled();
    expect(state.dismiss).not.toHaveBeenCalled();
  });

  it("still warns after optimistic cover dismissal when persistence fails", async () => {
    state.dismiss.mockRejectedValue(new Error("Offline"));
    window.localStorage.setItem("submit:alpha:PY3", "print(1)");
    await render(
      <ProblemsJoinCover contestKey="round1" joinKind="login" initiallyDismissed={false}>
        <QuickSubmit {...formProps} reminder={reminder}>
          <button type="button">Quick submit</button>
        </QuickSubmit>
      </ProblemsJoinCover>,
    );
    await click("View problems");
    await click("Quick submit");
    await shortcut();
    expect(document.body.textContent).toContain("You haven’t joined Round One");
    expect(state.submit).not.toHaveBeenCalled();
  });

  it("keeps chips visible beneath the real cover and delivers saved props to a later quick-submit dialog", async () => {
    // SAFETY: Account controls are absent; only these bar fields are consumed.
    const bar = {
      contest: { key: "round1", name: "Round One" },
      problems: [{ code: "alpha", name: "Alpha", label: "A", state: "untouched", contestProblemId: "1" }],
      links: {},
      showJoinWarning: true,
      endsAt: null,
      timeRemaining: null,
    } as NonNullable<ContestBarData>;

    const page = (acknowledged: boolean) => (
      <>
        <ContestBar data={bar} />
        <ProblemsJoinCover contestKey="round1" joinKind="login" initiallyDismissed={acknowledged}>
          <QuickSubmit {...formProps} reminder={{ ...reminder, acknowledged }}>
            <button type="button">Quick submit</button>
          </QuickSubmit>
        </ProblemsJoinCover>
      </>
    );

    await render(page(false));
    expect(document.querySelector("[data-chip]")?.getAttribute("href")).toBe("/contest/round1/problem/alpha");
    expect(state.queried).toHaveLength(0);
    await click("View problems");
    expect(state.dismiss).toHaveBeenCalledWith("round1");
    // The server action's RSC refresh supplies the persisted cookie, not local dismissal.
    await render(page(true));
    await click("Quick submit");
    expect(state.queried.length).toBeGreaterThan(0);
    // QuickSubmit starts with an empty editor; use its ordinary persisted draft.
    await act(async () => {
      const editor = document.querySelector("textarea");

      if (!editor) throw new Error("No editor");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(editor, "print(1)");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shortcut();
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("You haven’t joined Round One");
  });
});
