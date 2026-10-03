export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "build", "chore", "ci", "docs", "style", "refactor", "perf", "test"],
    ],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
