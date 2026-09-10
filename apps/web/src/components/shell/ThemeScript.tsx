/** Applies the stored theme before first paint so a dark-mode user never sees a
 *  white flash. `siteTheme` from the Convex profile is written into
 *  localStorage by ThemeToggle, so the two stay in sync. */
const SCRIPT = `(function(){try{var t=localStorage.getItem("moj-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export function ThemeScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline bootstrap script
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
