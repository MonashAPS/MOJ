"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldGroup,
  Input,
  Panel,
  Select,
  Textarea,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { AlertTriangle, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AdminForm } from "@/components/admin/AdminForm";
import { StatusLine } from "../../_components/console";

type Branding = {
  siteName: string;
  siteLongName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  accentColor: string;
  accentColorDark: string;
  navColor: string;
  titlebarColor: string;
  titlebarColorDark: string;
  customCss: string;
  themeDefault: "system" | "light" | "dark";
} | null;

const THEME_OPTIONS = [
  { value: "system", label: "Follow the visitor's system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DEFAULT_ACCENT = "#2941a5";
const DEFAULT_NAV = "#101a3d";

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseHex(value: string): [number, number, number] | null {
  if (!HEX.test(value.trim())) return null;
  const int = Number.parseInt(value.trim().slice(1), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast against white, the colour every button and nav item's text takes. */
function contrastWithWhite(value: string): number | null {
  const rgb = parseHex(value);
  if (!rgb) return null;
  return Math.round((1.05 / (luminance(rgb) + 0.05)) * 100) / 100;
}

function lighten(value: string, ratio: number): string {
  const rgb = parseHex(value);
  if (!rgb) return value;
  const part = (channel: number) =>
    Math.round(channel + (255 - channel) * ratio)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

export function BrandingForm({ branding }: { branding: Branding }) {
  const update = useMutation(api.pages.admin2.updateBranding);
  const uploadUrl = useMutation(api.pages.admin2.generateBrandingUploadUrl);

  const initial = useMemo(
    () => ({
      siteName: branding?.siteName ?? "MOJ",
      siteLongName: branding?.siteLongName ?? "MAPS Online Judge",
      accentColor: branding?.accentColor ?? DEFAULT_ACCENT,
      navColor: branding?.navColor ?? DEFAULT_NAV,
      customCss: branding?.customCss ?? "",
      themeDefault: branding?.themeDefault ?? "system",
    }),
    [branding],
  );

  const [form, setForm] = useState(initial);
  const [logo, setLogo] = useState<{ url: string; storageId: string } | null>(null);
  const [favicon, setFavicon] = useState<{ url: string; storageId: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: string }>({});
  const [uploadError, setUploadError] = useState<string | null>(null);

  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || logo !== null || favicon !== null;

  const accentContrast = contrastWithWhite(form.accentColor);
  const navContrast = contrastWithWhite(form.navColor);
  const accentValid = HEX.test(form.accentColor);
  const navValid = HEX.test(form.navColor);

  function change<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus({});
  }

  /** The file goes straight to Convex storage; only the id reaches the form. */
  async function upload(file: File, kind: "logo" | "favicon") {
    setUploadError(null);
    try {
      const url = await uploadUrl({});
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`The upload was refused (${response.status}).`);
      const { storageId } = (await response.json()) as { storageId: string };
      const objectUrl = URL.createObjectURL(file);
      if (kind === "logo") setLogo({ url: objectUrl, storageId });
      else setFavicon({ url: objectUrl, storageId });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "That file could not be uploaded to the judge.",
      );
    }
  }

  async function save() {
    if (reason.trim().length === 0) {
      setStatus({ error: "Give a reason for the change; it is recorded on the revision." });
      return;
    }
    if (!accentValid || !navValid) {
      setStatus({ error: "A colour must be a hex value like #2941a5." });
      return;
    }
    setBusy(true);
    try {
      await update({
        siteName: form.siteName,
        siteLongName: form.siteLongName,
        accentColor: form.accentColor,
        navColor: form.navColor,
        customCss: form.customCss,
        themeDefault: form.themeDefault as "system" | "light" | "dark",
        ...(logo ? { logoStorageId: logo.storageId as Id<"_storage"> } : {}),
        ...(favicon ? { faviconStorageId: favicon.storageId as Id<"_storage"> } : {}),
        reason,
      });
      // The uploads are part of the saved state now, so the form is clean again
      // and the unsaved-changes guard must stop firing.
      setLogo(null);
      setFavicon(null);
      setStatus({ saved: "The branding has been saved. Reload to see it applied across the site." });
      setReason("");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "The branding could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function clearUpload(kind: "logo" | "favicon") {
    setBusy(true);
    try {
      await update({
        [kind === "logo" ? "logoStorageId" : "faviconStorageId"]: null,
        reason: reason || `Removed the ${kind}`,
      });
      if (kind === "logo") setLogo(null);
      else setFavicon(null);
      setStatus({ saved: `The ${kind} has been removed; the bundled one is back.` });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : `The ${kind} could not be removed.` });
    } finally {
      setBusy(false);
    }
  }

  const logoSrc = logo?.url ?? branding?.logoUrl ?? null;
  const faviconSrc = favicon?.url ?? branding?.faviconUrl ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <AdminForm
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        dirty={dirty}
        busy={busy}
        error={status.error ?? null}
        saved={status.saved ?? null}
        submitLabel="Save branding"
      >
        <Panel title="Names" bodyClassName="grid gap-4 p-3">
          <FieldGroup columns={2}>
            <Field label="Site name" hint="The short name in the browser tab.">
              <Input
                value={form.siteName}
                maxLength={40}
                onChange={(event) => change("siteName", event.target.value)}
              />
            </Field>
            <Field label="Long name" hint="Used in the tab template, emails and metadata.">
              <Input
                value={form.siteLongName}
                onChange={(event) => change("siteLongName", event.target.value)}
              />
            </Field>
          </FieldGroup>
        </Panel>

        <Panel title="Marks" bodyClassName="grid gap-4 p-3">
          {uploadError ? <StatusLine tone="bad">{uploadError}</StatusLine> : null}
          <FieldGroup columns={2}>
            <Field
              label="Wordmark"
              optional=" (optional)"
              hint="SVG or PNG, shown in the nav and on the sign-in pages. Left empty, the bundled MOJ wordmark stays."
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-[132px] shrink-0 items-center justify-center rounded-md border border-border bg-titlebar px-2">
                  {logoSrc ? (
                    <img src={logoSrc} alt="" className="max-h-7 w-auto" />
                  ) : (
                    <img src="/logo.svg" alt="" className="max-h-7 w-auto" />
                  )}
                </span>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/svg+xml,image/png"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, "logo");
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Upload aria-hidden />}
                  onClick={() => logoInput.current?.click()}
                >
                  Upload
                </Button>
                {branding?.logoUrl || logo ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void clearUpload("logo")}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label="Favicon" optional=" (optional)" hint="A square PNG or SVG for the browser tab.">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                  <img src={faviconSrc ?? "/icon.svg"} alt="" className="size-6" />
                </span>
                <input
                  ref={faviconInput}
                  type="file"
                  accept="image/svg+xml,image/png,image/x-icon"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, "favicon");
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Upload aria-hidden />}
                  onClick={() => faviconInput.current?.click()}
                >
                  Upload
                </Button>
                {branding?.faviconUrl || favicon ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void clearUpload("favicon")}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </Field>
          </FieldGroup>
        </Panel>

        <Panel title="Colours" bodyClassName="grid gap-4 p-3">
          <FieldGroup columns={2}>
            <Field
              label="Accent"
              hint="Buttons, links and the focus ring. Dark mode lifts it automatically."
              error={accentValid ? undefined : "A colour must be a hex value like #2941a5."}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: accentValid ? form.accentColor : "transparent" }}
                />
                <Input
                  mono
                  value={form.accentColor}
                  invalid={!accentValid}
                  onChange={(event) => change("accentColor", event.target.value)}
                />
              </div>
            </Field>

            <Field
              label="Nav"
              hint="The bar at the top, and every panel titlebar and table header with it."
              error={navValid ? undefined : "A colour must be a hex value like #101a3d."}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: navValid ? form.navColor : "transparent" }}
                />
                <Input
                  mono
                  value={form.navColor}
                  invalid={!navValid}
                  onChange={(event) => change("navColor", event.target.value)}
                />
              </div>
            </Field>
          </FieldGroup>

          {accentContrast !== null && accentContrast < 4.5 ? (
            <Alert variant="warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              <AlertTitle>White text on that accent is hard to read</AlertTitle>
              <AlertDescription>
                It contrasts {accentContrast.toFixed(2)}:1 against white; a button label needs 4.5:1. Pick
                something darker.
              </AlertDescription>
            </Alert>
          ) : null}
          {navContrast !== null && navContrast < 4.5 ? (
            <Alert variant="warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              <AlertTitle>The nav labels will be hard to read</AlertTitle>
              <AlertDescription>
                That nav colour contrasts {navContrast.toFixed(2)}:1 against white, and the bar&rsquo;s text
                is white. Pick something darker.
              </AlertDescription>
            </Alert>
          ) : null}
        </Panel>

        <Panel title="Theme and custom CSS" bodyClassName="grid gap-4 p-3">
          <Field label="Default theme" hint="What a visitor with no stored preference gets.">
            <Select
              options={THEME_OPTIONS}
              value={form.themeDefault}
              onValueChange={(value) => change("themeDefault", value as "system" | "light" | "dark")}
              ariaLabel="Default theme"
            />
          </Field>
          <Field
            label="Custom CSS"
            optional=" (optional)"
            hint="Appended after everything else, so it wins. Different faces go here as @font-face rules."
          >
            <Textarea
              mono
              rows={10}
              value={form.customCss}
              onChange={(event) => change("customCss", event.target.value)}
              placeholder={":root { --radius: 2px; }"}
            />
          </Field>
        </Panel>
      </AdminForm>

      <Preview
        siteName={form.siteName}
        logoSrc={logoSrc}
        accent={accentValid ? form.accentColor : DEFAULT_ACCENT}
        nav={navValid ? form.navColor : DEFAULT_NAV}
      />
    </div>
  );
}

/** A mini nav and a button painted with the chosen values, so the operator sees
 *  the pair before it reaches every page. */
function Preview({
  siteName,
  logoSrc,
  accent,
  nav,
}: {
  siteName: string;
  logoSrc: string | null;
  accent: string;
  nav: string;
}) {
  return (
    <div className="lg:sticky lg:top-(--sticky-top) lg:self-start">
      <Panel title="Preview" bodyClassName="grid gap-3 p-3">
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex h-11 items-center gap-3 px-3" style={{ backgroundColor: nav }}>
            {logoSrc ? (
              <img src={logoSrc} alt="" className="h-5 w-auto" />
            ) : (
              <img src="/logo.svg" alt="" className="h-5 w-auto" />
            )}
            <span className="text-sm text-white/85">Problems</span>
            <span className="text-sm text-white/85">Contests</span>
          </div>
          <div aria-hidden className="h-[3px]" style={{ backgroundColor: accent }} />
          <div className="grid gap-3 bg-card p-3">
            <span className="font-display text-h3 font-semibold text-foreground">{siteName}</span>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-8 items-center rounded-md px-3 text-base font-medium text-white"
                style={{ backgroundColor: accent }}
              >
                Submit
              </span>
              <span className="text-base" style={{ color: accent }}>
                A link
              </span>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <div
                className="flex h-7 items-center px-3 font-sans text-xs font-semibold uppercase tracking-label text-white/90"
                style={{ backgroundColor: nav }}
              >
                A table header
              </div>
              <div className="px-3 py-2 text-base text-subtle">and a row under it</div>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Dark mode lifts the accent to {lighten(accent, 0.45)} and keeps the nav as it is.
        </p>
      </Panel>
    </div>
  );
}
