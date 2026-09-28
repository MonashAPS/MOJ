export function problemsViewedCookieName(contestKey: string): string {
  return `moj-contest-problems-viewed-${encodeURIComponent(contestKey)}`;
}
