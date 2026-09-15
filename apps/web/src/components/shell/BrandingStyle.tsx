import { type BrandingValues, brandingCss } from "@/lib/branding";

export type { BrandingValues };

/**
 * SPEC section 24: the operator's colours and logo reach the page as overrides
 * on `:root`, emitted once per request by the root layout.
 */
export function BrandingStyle({ branding }: { branding: BrandingValues | null }) {
  const css = brandingCss(branding);

  if (css === null) return null;

  return (
    <style
      data-branding=""
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the values are validated in Convex and escaped in brandingCss
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
