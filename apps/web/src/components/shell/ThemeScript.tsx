/** Applies the stored theme before first paint so a dark-mode user never sees a
 *  white flash. `siteTheme` from the Convex profile is written into
 *  localStorage by ThemeToggle, so the two stay in sync. A visitor with nothing
 *  stored gets the operator's default (SPEC section 24); "system" leaves the
 *  attribute off and lets `prefers-color-scheme` decide, as before. */
function script(defaultTheme: "system" | "light" | "dark"): string {
  return `(function(){try{var t=localStorage.getItem("moj-theme");if(t!=="dark"&&t!=="light"){t=${JSON.stringify(
    defaultTheme,
  )};}if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
}

export function ThemeScript({ defaultTheme = "system" }: { defaultTheme?: "system" | "light" | "dark" }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline bootstrap script
  return <script dangerouslySetInnerHTML={{ __html: script(defaultTheme) }} />;
}
