/** DMOJ addresses an organisation as `<pk>-<slug>` and a class as `<cpk>-<cslug>`
 *  inside it. Next cannot put two dynamic parts in one segment, so the segment is
 *  read whole and split here. A link without the pk still resolves: the slug is
 *  what the query takes. */

export type Addressable = { slug: string; legacyId?: number | null };

export function organizationHandle(organization: Addressable): string {
  return organization.legacyId ? `${organization.legacyId}-${organization.slug}` : organization.slug;
}

export function organizationHref(organization: Addressable, suffix = ""): string {
  return `/organization/${organizationHandle(organization)}${suffix}`;
}

export function classHref(organization: Addressable, klass: Addressable, suffix = ""): string {
  return `${organizationHref(organization)}/class/${organizationHandle(klass)}${suffix}`;
}

/** `<pk>-<slug>` -> `slug`. A slug may itself contain dashes, so only the leading
 *  run of digits is dropped, and a handle that is already a slug is untouched. */
export function slugFromHandle(handle: string): string {
  const decoded = decodeURIComponent(handle);
  const match = /^(\d+)-(.+)$/.exec(decoded);

  return match?.[2] ?? decoded;
}
