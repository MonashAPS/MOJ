import { type ThemeDefault, themeBootstrap } from "@/lib/theme";

export function ThemeScript({ defaultTheme = "system" }: { defaultTheme?: ThemeDefault }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline bootstrap script
  return <script dangerouslySetInnerHTML={{ __html: themeBootstrap(defaultTheme) }} />;
}
