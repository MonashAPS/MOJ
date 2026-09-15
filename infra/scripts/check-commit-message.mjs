import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "build", "chore", "ci", "docs", "style", "refactor", "perf", "test"];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9/_-]+\\))?!?: [a-z0-9][^\\n]*[^.\\s]$`);

const [file] = process.argv.slice(2);
const message = readFileSync(file, "utf8");
const header = message.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "";

if (/^(Merge|Revert|fixup!|squash!) /.test(header) || HEADER.test(header)) {
  process.exit(0);
}

console.error(`Commit message header does not follow Conventional Commits:\n  ${header}`);
console.error(`Expected <type>[(scope)]: <lowercase imperative description, no trailing period>`);
console.error(`Types: ${TYPES.join(", ")}`);
process.exit(1);
