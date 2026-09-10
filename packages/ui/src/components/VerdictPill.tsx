import { cn } from "../cn";

export type Verdict =
  | "AC"
  | "WA"
  | "TLE"
  | "MLE"
  | "OLE"
  | "IR"
  | "RTE"
  | "CE"
  | "IE"
  | "SC"
  | "AB"
  | "QU"
  | "P"
  | "G"
  | "D";

const TOKEN: Record<string, string> = {
  AC: "var(--v-ac)",
  SC: "var(--v-sc)",
  WA: "var(--v-wa)",
  TLE: "var(--v-tle)",
  MLE: "var(--v-mle)",
  CE: "var(--v-ce)",
  AB: "var(--v-ab)",
  OLE: "var(--v-ole)",
  IR: "var(--v-ir)",
  RTE: "var(--v-rte)",
  IE: "var(--v-ie)",
  QU: "var(--v-qu)",
  P: "var(--v-pending)",
  G: "var(--v-pending)",
  D: "var(--v-qu)",
};

const LABEL: Record<string, string> = {
  AC: "AC",
  SC: "SC",
  WA: "WA",
  TLE: "TLE",
  MLE: "MLE",
  CE: "CE",
  AB: "AB",
  OLE: "OLE",
  IR: "IR",
  RTE: "RTE",
  IE: "IE",
  QU: "QU",
  P: "P",
  G: "G",
  D: "D",
};

const TITLE: Record<string, string> = {
  AC: "Accepted",
  SC: "Short circuited",
  WA: "Wrong Answer",
  TLE: "Time Limit Exceeded",
  MLE: "Memory Limit Exceeded",
  CE: "Compile Error",
  AB: "Aborted",
  OLE: "Output Limit Exceeded",
  IR: "Invalid Return",
  RTE: "Runtime Error",
  IE: "Internal Error",
  QU: "Queued",
  P: "Processing",
  G: "Grading",
  D: "Done",
};

export function VerdictPill({
  verdict,
  label,
  className,
}: {
  verdict: Verdict | string;
  label?: string;
  className?: string;
}) {
  const key = String(verdict).toUpperCase();
  return (
    <span
      className={cn("verdict-pill", className)}
      style={{ background: TOKEN[key] ?? "var(--muted)" }}
      title={TITLE[key] ?? key}
    >
      {label ?? LABEL[key] ?? key}
    </span>
  );
}
