import { cn } from "../cn";
import { Badge } from "./badge";

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

export type VerdictTone = "good" | "bad" | "warn" | "neutral" | "run" | "ie";

/** The one resolver. No component writes an inline ternary over verdict codes and
 *  no component hard-codes a verdict colour. */
export function verdictTone(code: string): VerdictTone {
  switch (String(code).toUpperCase()) {
    case "AC":
    case "SC":
      return "good";
    case "WA":
      return "bad";
    case "IE":
      return "ie";
    case "OLE":
    case "IR":
    case "RTE":
    case "PARTIAL":
    // `Submission.result_class_from_code`: an AC that did not take every point.
    case "_AC":
      return "warn";
    case "QU":
    case "P":
    case "G":
      return "run";
    default:
      return "neutral";
  }
}

const TITLE: Record<string, string> = {
  AC: "Accepted",
  _AC: "Partially accepted",
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

/** Colour is never the only signal: the code is always rendered. */
export function VerdictPill({
  verdict,
  label,
  judging = false,
  size,
  className,
}: {
  verdict: Verdict | string;
  label?: string;
  /** Adds the one loop in the product; a static dot under reduced motion. */
  judging?: boolean;
  size?: "default" | "lg";
  className?: string;
}) {
  const code = String(verdict).toUpperCase();
  const tone = judging ? "run" : verdictTone(code);
  const text = label ?? (code === "_AC" ? "AC" : code);

  return (
    <Badge
      variant={tone}
      rounding="square"
      size={size}
      mono
      title={TITLE[code] ?? code}
      className={cn(judging && "animate-pulse-judging", className)}
    >
      {text}
    </Badge>
  );
}
