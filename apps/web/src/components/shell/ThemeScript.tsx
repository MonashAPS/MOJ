import { type Skin, skinBootstrap } from "@/lib/skin";
import { type ThemeDefault, themeBootstrap } from "@/lib/theme";

/** Both pre-paint bootstraps, in one script tag: light or dark, and which skin.
 *  `defaultSkin` is what the server rendered the page with, so a browser that
 *  has never been told a skin leaves the markup's own alone. */
export function ThemeScript({
  defaultTheme = "system",
  defaultSkin = "maps",
}: {
  defaultTheme?: ThemeDefault;
  defaultSkin?: Skin;
}) {
  const bootstrap = `${themeBootstrap(defaultTheme)}${skinBootstrap(defaultSkin)}`;

  // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline bootstrap script
  return <script dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
